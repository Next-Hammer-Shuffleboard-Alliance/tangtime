#!/usr/bin/env python3
"""
RecRec Full Data Scraper for TangTime
=====================================
Extracts ALL historical league data from RecRec for Royal Palms Brooklyn.

Usage:
    python3 recrec_scraper_full.py

Output:
    recrec_full_data.json - Complete historical data
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


@dataclass
class Team:
    id: str
    name: str
    elo: Optional[int] = None
    wins: int = 0
    losses: int = 0
    streak: str = ""
    seasons_played: int = 0
    all_time_record: str = ""


@dataclass
class Match:
    date: str
    time: str
    court: str
    team_a_id: str
    team_a_name: str
    team_b_id: str
    team_b_name: str
    winner_id: Optional[str] = None


@dataclass
class Division:
    id: str
    name: str
    teams: List[Dict] = field(default_factory=list)
    matches: List[Dict] = field(default_factory=list)


@dataclass
class Season:
    id: str
    name: str
    start_date: str
    divisions: List[Dict] = field(default_factory=list)


class RecRecScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        self.teams_cache = {}  # Cache team details to avoid re-fetching
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
        
        # Find all season links in tables
        for link in soup.find_all('a', href=True):
            href = link['href']
            if '/seasons/' in href and '/info' in href:
                season_id = href.split('/')[2]
                name = link.text.strip()
                
                # Find the date in the same row
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
        
        # Remove duplicates while preserving order
        seen = set()
        unique_seasons = []
        for s in seasons:
            if s['id'] not in seen:
                seen.add(s['id'])
                unique_seasons.append(s)
        
        return unique_seasons
    
    def get_season_divisions(self, season_id: str) -> List[Dict]:
        """Get all divisions for a season from the standings page"""
        soup = self.get_page(f"{BASE_URL}/seasons/{season_id}/standings")
        if not soup:
            return []
        
        divisions = []
        
        # Look for division headers/links - they typically have the division name
        # and link to /divisions/{id}
        for link in soup.find_all('a', href=True):
            href = link['href']
            if '/divisions/' in href and '/info' in href:
                div_id = href.split('/')[2]
                name = link.text.strip()
                
                if div_id and name and div_id not in [d['id'] for d in divisions]:
                    divisions.append({
                        'id': div_id,
                        'name': name
                    })
        
        # Also check for division links without /info
        for link in soup.find_all('a', href=True):
            href = link['href']
            match = re.match(r'^/divisions/([^/]+)$', href)
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
        
        # Find all table rows
        for row in soup.find_all('tr'):
            # Look for competitor links
            team_link = row.find('a', href=lambda h: h and '/competitors/' in h)
            if not team_link:
                continue
            
            team_id = team_link['href'].split('/')[2]
            team_name = team_link.text.strip()
            
            # Get all text content from the row to find W/L/Streak
            cells = row.find_all('td')
            
            wins = 0
            losses = 0
            streak = ""
            
            # Parse cells - typically: Rank, Team Name, W, L, Streak
            cell_texts = [cell.text.strip() for cell in cells]
            
            for i, text in enumerate(cell_texts):
                # Look for win/loss numbers (they're usually single digits or small numbers)
                if text.isdigit():
                    num = int(text)
                    # Skip if this looks like a rank (first column, usually 1-20)
                    if i == 0 and num <= 30:
                        continue
                    # If we haven't found wins yet, this is likely wins
                    if wins == 0:
                        wins = num
                    elif losses == 0:
                        losses = num
                # Look for streak (W1, L2, W5, etc.)
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
    
    def get_division_matches(self, division_id: str) -> List[Dict]:
        """Get all past matches for a division"""
        soup = self.get_page(f"{BASE_URL}/divisions/{division_id}/schedule/past")
        if not soup:
            return []
        
        matches = []
        
        for row in soup.find_all('tr'):
            # Find team links
            team_links = row.find_all('a', href=lambda h: h and '/competitors/' in h)
            if len(team_links) < 2:
                continue
            
            # Get teams
            team_a_id = team_links[0]['href'].split('/')[2]
            team_a_name = team_links[0].text.strip()
            team_b_id = team_links[1]['href'].split('/')[2]
            team_b_name = team_links[1].text.strip()
            
            # Get date/time/court from row text
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
                'team_b_name': team_b_name
            })
        
        return matches
    
    def get_team_details(self, team_id: str) -> Optional[Dict]:
        """Get detailed info for a team including ELO and full record"""
        # Check cache first
        if team_id in self.teams_cache:
            return self.teams_cache[team_id]
        
        soup = self.get_page(f"{BASE_URL}/competitors/{team_id}")
        if not soup:
            return None
        
        page_text = soup.get_text()
        
        # Get team name
        name = ""
        name_link = soup.find('a', href=f"/competitors/{team_id}")
        if name_link:
            name = name_link.text.strip()
        
        # Extract ELO
        elo = None
        elo_match = re.search(r'ELO Rating:\s*(\d+)', page_text)
        if elo_match:
            elo = int(elo_match.group(1))
        
        # Extract overall record
        record = ""
        wins = 0
        losses = 0
        record_match = re.search(r'Record:\s*(\d+)\s*-\s*(\d+)', page_text)
        if record_match:
            wins = int(record_match.group(1))
            losses = int(record_match.group(2))
            record = f"{wins}-{losses}"
        
        # Extract seasons played
        seasons = 0
        seasons_match = re.search(r'(\d+)\s*Seasons?', page_text)
        if seasons_match:
            seasons = int(seasons_match.group(1))
        
        details = {
            'id': team_id,
            'name': name,
            'elo': elo,
            'all_time_wins': wins,
            'all_time_losses': losses,
            'all_time_record': record,
            'seasons_played': seasons
        }
        
        # Cache for later
        self.teams_cache[team_id] = details
        
        return details


def main():
    """Main function to scrape all RecRec data"""
    scraper = RecRecScraper()
    
    print("=" * 70)
    print("🏒 RecRec Full Data Scraper for TangTime")
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
    
    # Show seasons
    print("\n   Recent seasons:")
    for s in seasons[:5]:
        print(f"      • {s['name']} ({s['start_date']})")
    if len(seasons) > 5:
        print(f"      ... and {len(seasons) - 5} more")
    
    # =========================================================================
    # STEP 2: Process each season
    # =========================================================================
    print("\n" + "=" * 70)
    print("📊 STEP 2: Processing all seasons and divisions...")
    print("=" * 70)
    
    all_data = {
        'venue': 'Royal Palms Brooklyn',
        'scraped_at': datetime.now().isoformat(),
        'seasons': [],
        'all_teams': {}  # Deduplicated team info with ELO
    }
    
    total_divisions = 0
    total_teams = 0
    total_matches = 0
    team_ids_seen = set()
    
    for i, season in enumerate(seasons):
        print(f"\n[{i+1}/{len(seasons)}] 📆 {season['name']}")
        
        # Get divisions for this season
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
            
            # Get matches
            matches = scraper.get_division_matches(div['id'])
            
            print(f"{len(teams)} teams, {len(matches)} matches")
            
            # Track unique team IDs
            for team in teams:
                team_ids_seen.add(team['id'])
            
            division_data = {
                'id': div['id'],
                'name': div['name'],
                'teams': teams,
                'matches': matches
            }
            
            season_data['divisions'].append(division_data)
            total_divisions += 1
            total_teams += len(teams)
            total_matches += len(matches)
        
        all_data['seasons'].append(season_data)
    
    # =========================================================================
    # STEP 3: Get detailed team info (ELO, all-time record)
    # =========================================================================
    print("\n" + "=" * 70)
    print("👥 STEP 3: Getting team details (ELO ratings, all-time records)...")
    print("=" * 70)
    
    unique_team_ids = list(team_ids_seen)
    print(f"   Found {len(unique_team_ids)} unique teams to look up")
    
    for i, team_id in enumerate(unique_team_ids):
        if (i + 1) % 50 == 0 or i == 0:
            print(f"   Processing team {i+1}/{len(unique_team_ids)}...")
        
        details = scraper.get_team_details(team_id)
        if details:
            all_data['all_teams'][team_id] = details
    
    print(f"   ✅ Got details for {len(all_data['all_teams'])} teams")
    
    # =========================================================================
    # STEP 4: Save data
    # =========================================================================
    print("\n" + "=" * 70)
    print("💾 STEP 4: Saving data...")
    print("=" * 70)
    
    output_file = 'recrec_full_data.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, indent=2, ensure_ascii=False)
    
    print(f"   ✅ Data saved to: {output_file}")
    
    # =========================================================================
    # SUMMARY
    # =========================================================================
    print("\n" + "=" * 70)
    print("📈 SCRAPE COMPLETE - SUMMARY")
    print("=" * 70)
    print(f"""
   ✅ Seasons scraped:     {len(all_data['seasons'])}
   ✅ Divisions scraped:   {total_divisions}
   ✅ Team-season records: {total_teams}
   ✅ Match records:       {total_matches}
   ✅ Unique teams:        {len(all_data['all_teams'])}
   
   📁 Output file: {output_file}
   🌐 Total HTTP requests: {scraper.request_count}
   
   Data includes:
   • Team names and IDs
   • Season-by-season W/L records
   • Team ELO ratings (current)
   • All-time records
   • Complete match schedules with courts
   
   ❌ Not available from RecRec:
   • Game-by-game scores (only W/L)
   • Player rosters
   • Player-team assignments
""")


if __name__ == "__main__":
    main()
