#!/usr/bin/env python3
"""
RecRec Full Data Scraper v2 for TangTime
========================================
Now correctly captures win/loss results from team pages.

Usage:
    python3 recrec_scraper_v2.py

Output:
    recrec_full_data_v2.json - Complete historical data with winners
"""

import requests
from bs4 import BeautifulSoup
import json
import re
import time
import sys
from dataclasses import dataclass, asdict, field
from typing import List, Optional, Dict
from datetime import datetime

BASE_URL = "https://app.recrec.io"
VENUE_SLUG = "royal-palms-brooklyn"

# Rate limiting - be nice to their servers
REQUEST_DELAY = 0.5  # seconds between requests


class RecRecScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        self.request_count = 0
    
    def get_page(self, url: str) -> Optional[BeautifulSoup]:
        """Fetch a page and return parsed HTML"""
        self.request_count += 1
        try:
            resp = self.session.get(url, timeout=30)
            resp.raise_for_status()
            time.sleep(REQUEST_DELAY)
            return BeautifulSoup(resp.text, 'html.parser')
        except Exception as e:
            print(f"    ⚠️  Error fetching {url}: {e}")
            return None
    
    def get_venue_seasons(self) -> List[Dict]:
        """Get all seasons for Royal Palms Brooklyn"""
        print(f"📍 Fetching venue: {VENUE_SLUG}")
        soup = self.get_page(f"{BASE_URL}/{VENUE_SLUG}")
        if not soup:
            return []
        
        seasons = []
        
        for link in soup.find_all('a', href=True):
            href = link['href']
            if '/seasons/' in href and '/info' in href:
                season_id = href.split('/')[2]
                name = link.text.strip()
                
                parent_row = link.find_parent('tr')
                start_date = ""
                if parent_row:
                    cells = parent_row.find_all('td')
                    if len(cells) >= 2:
                        start_date = cells[1].text.strip()
                
                if season_id and name:
                    seasons.append({
                        'id': season_id,
                        'name': name,
                        'start_date': start_date
                    })
        
        # Remove duplicates
        seen = set()
        unique_seasons = []
        for s in seasons:
            if s['id'] not in seen:
                seen.add(s['id'])
                unique_seasons.append(s)
        
        return unique_seasons
    
    def get_season_divisions(self, season_id: str) -> List[Dict]:
        """Get all divisions for a season"""
        soup = self.get_page(f"{BASE_URL}/seasons/{season_id}/standings")
        if not soup:
            return []
        
        divisions = []
        
        for link in soup.find_all('a', href=True):
            href = link['href']
            if '/divisions/' in href:
                match = re.search(r'/divisions/([^/]+)', href)
                if match:
                    div_id = match.group(1)
                    name = link.text.strip()
                    
                    if div_id and name and div_id not in [d['id'] for d in divisions]:
                        divisions.append({
                            'id': div_id,
                            'name': name
                        })
        
        return divisions
    
    def get_division_standings(self, division_id: str) -> List[Dict]:
        """Get standings/teams for a division"""
        soup = self.get_page(f"{BASE_URL}/divisions/{division_id}/standings")
        if not soup:
            return []
        
        teams = []
        
        for row in soup.find_all('tr'):
            team_link = row.find('a', href=lambda h: h and '/competitors/' in h)
            if not team_link:
                continue
            
            team_id = team_link['href'].split('/')[2]
            team_name = team_link.text.strip()
            
            cells = row.find_all('td')
            cell_texts = [cell.text.strip() for cell in cells]
            
            wins = 0
            losses = 0
            streak = ""
            
            for i, text in enumerate(cell_texts):
                if text.isdigit():
                    num = int(text)
                    if i == 0 and num <= 30:
                        continue
                    if wins == 0:
                        wins = num
                    elif losses == 0:
                        losses = num
                elif re.match(r'^[WL]\d+$', text):
                    streak = text
            
            if team_id and team_name:
                teams.append({
                    'id': team_id,
                    'name': team_name,
                    'wins': wins,
                    'losses': losses,
                    'streak': streak
                })
        
        return teams
    
    def get_division_schedule(self, division_id: str, past: bool = True) -> List[Dict]:
        """Get matches for a division (past or upcoming)"""
        endpoint = "past" if past else ""
        url = f"{BASE_URL}/divisions/{division_id}/schedule"
        if past:
            url += "/past"
        
        soup = self.get_page(url)
        if not soup:
            return []
        
        matches = []
        
        for row in soup.find_all('tr'):
            team_links = row.find_all('a', href=lambda h: h and '/competitors/' in h)
            if len(team_links) < 2:
                continue
            
            team_a_id = team_links[0]['href'].split('/')[2]
            team_a_name = team_links[0].text.strip()
            team_b_id = team_links[1]['href'].split('/')[2]
            team_b_name = team_links[1].text.strip()
            
            row_text = row.get_text()
            
            date_match = re.search(r'(\d{1,2}/\d{1,2}/\d{4})', row_text)
            time_match = re.search(r'(\d{1,2}:\d{2}\s*[AP]M)', row_text)
            court_match = re.search(r'Court\s*(\d+)', row_text)
            
            date = date_match.group(1) if date_match else ""
            match_time = time_match.group(1) if time_match else ""
            court = f"Court {court_match.group(1)}" if court_match else ""
            
            matches.append({
                'date': date,
                'time': match_time,
                'court': court,
                'team_a_id': team_a_id,
                'team_a_name': team_a_name,
                'team_b_id': team_b_id,
                'team_b_name': team_b_name,
                'status': 'completed' if past else 'scheduled'
            })
        
        return matches
    
    def get_team_match_results(self, team_id: str, team_name: str) -> List[Dict]:
        """
        Get match results from team's page - this is where Win/Loss is shown!
        Returns list of matches with results from this team's perspective.
        """
        soup = self.get_page(f"{BASE_URL}/competitors/{team_id}")
        if not soup:
            return []
        
        results = []
        
        # Find the "Past Matches" table
        for row in soup.find_all('tr'):
            cells = row.find_all('td')
            if len(cells) < 4:
                continue
            
            # Look for opponent link
            opponent_link = row.find('a', href=lambda h: h and '/competitors/' in h)
            if not opponent_link:
                continue
            
            opponent_id = opponent_link['href'].split('/')[2]
            opponent_name = opponent_link.text.strip()
            
            # Get all cell text
            cell_texts = [cell.text.strip() for cell in cells]
            row_text = ' '.join(cell_texts)
            
            # Extract date
            date_match = re.search(r'(\d{1,2}/\d{1,2}/\d{4})', row_text)
            date = date_match.group(1) if date_match else ""
            
            # Extract time
            time_match = re.search(r'(\d{1,2}:\d{2}\s*[AP]M)', row_text)
            match_time = time_match.group(1) if time_match else ""
            
            # Extract court
            court_match = re.search(r'Court\s*(\d+)', row_text)
            court = f"Court {court_match.group(1)}" if court_match else ""
            
            # CRITICAL: Extract result (Won/Lost/Unknown)
            result = None
            if 'Won' in row_text:
                result = 'won'
            elif 'Lost' in row_text:
                result = 'lost'
            elif 'Unknown' in row_text:
                result = 'unknown'
            
            if date and opponent_id:
                results.append({
                    'team_id': team_id,
                    'team_name': team_name,
                    'opponent_id': opponent_id,
                    'opponent_name': opponent_name,
                    'date': date,
                    'time': match_time,
                    'court': court,
                    'result': result  # 'won', 'lost', 'unknown', or None
                })
        
        return results
    
    def get_team_details(self, team_id: str) -> Optional[Dict]:
        """Get detailed info for a team including ELO and full record"""
        soup = self.get_page(f"{BASE_URL}/competitors/{team_id}")
        if not soup:
            return None
        
        page_text = soup.get_text()
        
        # Get team name
        name = ""
        h1 = soup.find('h1')
        if h1:
            name = h1.text.strip()
        
        # Extract ELO
        elo = None
        elo_match = re.search(r'ELO[:\s]*(\d+)', page_text, re.IGNORECASE)
        if elo_match:
            elo = int(elo_match.group(1))
        
        # Extract overall record
        wins = 0
        losses = 0
        record_match = re.search(r'(\d+)\s*-\s*(\d+)', page_text)
        if record_match:
            wins = int(record_match.group(1))
            losses = int(record_match.group(2))
        
        return {
            'id': team_id,
            'name': name,
            'elo': elo,
            'all_time_wins': wins,
            'all_time_losses': losses
        }


def main():
    """Main function to scrape all RecRec data"""
    scraper = RecRecScraper()
    
    print("=" * 70)
    print("🏒 RecRec Full Data Scraper v2 for TangTime")
    print("=" * 70)
    print()
    
    # =========================================================================
    # STEP 1: Get all seasons
    # =========================================================================
    print("📅 STEP 1: Getting all seasons...")
    print("-" * 50)
    
    seasons = scraper.get_venue_seasons()
    print(f"   Found {len(seasons)} seasons")
    
    if not seasons:
        print("❌ No seasons found. Exiting.")
        return
    
    # =========================================================================
    # STEP 2: Process each season - get divisions, standings, and schedules
    # =========================================================================
    print("\n" + "=" * 70)
    print("📊 STEP 2: Processing all seasons and divisions...")
    print("=" * 70)
    
    all_data = {
        'venue': 'Royal Palms Brooklyn',
        'scraped_at': datetime.now().isoformat(),
        'seasons': [],
        'all_teams': {},
        'team_match_results': []  # NEW: Store match results with winners
    }
    
    team_ids_seen = set()
    
    for i, season in enumerate(seasons):
        print(f"\n[{i+1}/{len(seasons)}] 📆 {season['name']}")
        
        divisions = scraper.get_season_divisions(season['id'])
        print(f"         Found {len(divisions)} divisions")
        
        season_data = {
            'id': season['id'],
            'name': season['name'],
            'start_date': season['start_date'],
            'divisions': []
        }
        
        for div in divisions:
            print(f"         📁 {div['name']}...", end=" ", flush=True)
            
            # Get standings
            teams = scraper.get_division_standings(div['id'])
            
            # Get PAST matches
            past_matches = scraper.get_division_schedule(div['id'], past=True)
            
            # Get UPCOMING matches (for current seasons)
            upcoming_matches = scraper.get_division_schedule(div['id'], past=False)
            
            all_matches = past_matches + upcoming_matches
            
            print(f"{len(teams)} teams, {len(past_matches)} past + {len(upcoming_matches)} upcoming matches")
            
            for team in teams:
                team_ids_seen.add(team['id'])
            
            division_data = {
                'id': div['id'],
                'name': div['name'],
                'teams': teams,
                'matches': all_matches
            }
            
            season_data['divisions'].append(division_data)
        
        all_data['seasons'].append(season_data)
    
    # =========================================================================
    # STEP 3: Get match results from each team's page (THIS HAS W/L DATA!)
    # =========================================================================
    print("\n" + "=" * 70)
    print("🏆 STEP 3: Getting match results from team pages (W/L data)...")
    print("=" * 70)
    
    unique_team_ids = list(team_ids_seen)
    print(f"   Found {len(unique_team_ids)} unique teams to process")
    
    for i, team_id in enumerate(unique_team_ids):
        if (i + 1) % 25 == 0 or i == 0:
            print(f"   Processing team {i+1}/{len(unique_team_ids)}...")
        
        # Get team details (ELO, record)
        details = scraper.get_team_details(team_id)
        if details:
            all_data['all_teams'][team_id] = details
            
            # Get match results with W/L
            results = scraper.get_team_match_results(team_id, details.get('name', ''))
            all_data['team_match_results'].extend(results)
    
    print(f"   ✅ Got {len(all_data['team_match_results'])} match results with W/L data")
    
    # =========================================================================
    # STEP 4: Save data
    # =========================================================================
    print("\n" + "=" * 70)
    print("💾 STEP 4: Saving data...")
    print("=" * 70)
    
    output_file = 'recrec_full_data_v2.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, indent=2, ensure_ascii=False)
    
    print(f"   ✅ Data saved to: {output_file}")
    
    # =========================================================================
    # SUMMARY
    # =========================================================================
    print("\n" + "=" * 70)
    print("📈 SCRAPE COMPLETE - SUMMARY")
    print("=" * 70)
    
    total_divisions = sum(len(s['divisions']) for s in all_data['seasons'])
    total_matches = sum(
        len(d['matches']) 
        for s in all_data['seasons'] 
        for d in s['divisions']
    )
    
    print(f"""
   ✅ Seasons scraped:     {len(all_data['seasons'])}
   ✅ Divisions scraped:   {total_divisions}
   ✅ Match records:       {total_matches}
   ✅ Unique teams:        {len(all_data['all_teams'])}
   ✅ Match results (W/L): {len(all_data['team_match_results'])}
   
   📁 Output file: {output_file}
   🌐 Total HTTP requests: {scraper.request_count}
   
   NEW in v2:
   • Match results now include Won/Lost/Unknown from team pages
   • Both past AND upcoming matches scraped
   • Can now properly set winner_id in database
""")


if __name__ == "__main__":
    main()
