import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

function Dashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [recentMatches, setRecentMatches] = useState([])
  const [hotStreaks, setHotStreaks] = useState([])
  const [divisionLeaders, setDivisionLeaders] = useState([])
  const [playoffBubble, setPlayoffBubble] = useState([])
  const [userTeam, setUserTeam] = useState(null)

  useEffect(() => {
    fetchDashboardData()
  }, [user])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      // Fetch recent matches and current season in parallel
      const [recentResult, seasonsResult] = await Promise.all([
        supabase
          .from('matches')
          .select(`
            id,
            scheduled_date,
            court,
            team_a:teams!matches_team_a_id_fkey(id, name),
            team_b:teams!matches_team_b_id_fkey(id, name),
            winner:teams!matches_winner_id_fkey(id, name),
            division:divisions(name)
          `)
          .eq('status', 'completed')
          .not('winner_id', 'is', null)
          .order('scheduled_date', { ascending: false })
          .limit(6),
        supabase
          .from('seasons')
          .select('id, name')
          .order('start_date', { ascending: false })
          .limit(1)
      ])

      setRecentMatches(recentResult.data || [])

      const currentSeasonId = seasonsResult.data?.[0]?.id

      if (currentSeasonId) {
        // Get divisions for current season
        const { data: divisions } = await supabase
          .from('divisions')
          .select('id, name')
          .eq('season_id', currentSeasonId)

        if (divisions && divisions.length > 0) {
          // Fetch all matches for current season divisions in one query
          const divisionIds = divisions.map(d => d.id)
          
          const { data: allMatches } = await supabase
            .from('matches')
            .select(`
              id,
              division_id,
              team_a_id,
              team_b_id,
              winner_id,
              status,
              scheduled_date,
              team_a:teams!matches_team_a_id_fkey(id, name),
              team_b:teams!matches_team_b_id_fkey(id, name)
            `)
            .in('division_id', divisionIds)
            .eq('status', 'completed')
            .order('scheduled_date', { ascending: true })

          // Process all data locally
          processMatchData(allMatches || [], divisions)
        }
      }

    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const processMatchData = (matches, divisions) => {
    const divisionMap = new Map(divisions.map(d => [d.id, d.name]))
    
    // Group matches by division
    const matchesByDivision = new Map()
    divisions.forEach(d => matchesByDivision.set(d.id, []))
    
    matches.forEach(match => {
      if (matchesByDivision.has(match.division_id)) {
        matchesByDivision.get(match.division_id).push(match)
      }
    })

    const leaders = []
    const streaks = []
    const bubble = []

    matchesByDivision.forEach((divMatches, divId) => {
      const divName = divisionMap.get(divId)
      if (!divMatches.length) return

      // Calculate stats
      const teamStats = new Map()
      const teamHistory = new Map()
      const teamInfo = new Map()

      divMatches.forEach(match => {
        // Initialize teams
        if (match.team_a && !teamStats.has(match.team_a.id)) {
          teamStats.set(match.team_a.id, { wins: 0, losses: 0 })
          teamHistory.set(match.team_a.id, [])
          teamInfo.set(match.team_a.id, match.team_a)
        }
        if (match.team_b && !teamStats.has(match.team_b.id)) {
          teamStats.set(match.team_b.id, { wins: 0, losses: 0 })
          teamHistory.set(match.team_b.id, [])
          teamInfo.set(match.team_b.id, match.team_b)
        }

        if (match.winner_id) {
          const loserId = match.team_a_id === match.winner_id ? match.team_b_id : match.team_a_id
          
          if (teamStats.has(match.winner_id)) {
            teamStats.get(match.winner_id).wins++
            teamHistory.get(match.winner_id)?.push('W')
          }
          if (teamStats.has(loserId)) {
            teamStats.get(loserId).losses++
            teamHistory.get(loserId)?.push('L')
          }
        }
      })

      // Sort by wins
      const sorted = Array.from(teamStats.entries())
        .map(([id, stats]) => ({ id, ...stats, team: teamInfo.get(id) }))
        .sort((a, b) => b.wins !== a.wins ? b.wins - a.wins : a.losses - b.losses)

      // Division leader
      if (sorted.length > 0 && sorted[0].team) {
        leaders.push({
          ...sorted[0].team,
          wins: sorted[0].wins,
          losses: sorted[0].losses,
          division: divName
        })
      }

      // Hot streaks (3+ wins)
      teamHistory.forEach((history, teamId) => {
        if (history.length === 0) return
        if (history[history.length - 1] !== 'W') return
        
        let count = 0
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i] === 'W') count++
          else break
        }
        
        if (count >= 3) {
          const team = teamInfo.get(teamId)
          if (team) {
            streaks.push({ ...team, streak: count, division: divName })
          }
        }
      })

      // Bubble teams (positions 5-6)
      sorted.slice(4, 6).forEach((stats, idx) => {
        if (stats.team) {
          bubble.push({
            ...stats.team,
            wins: stats.wins,
            losses: stats.losses,
            position: idx + 5,
            division: divName,
            inPlayoffs: idx === 0
          })
        }
      })
    })

    // Sort and limit
    streaks.sort((a, b) => b.streak - a.streak)
    
    setDivisionLeaders(leaders.slice(0, 6))
    setHotStreaks(streaks.slice(0, 6))
    setPlayoffBubble(bubble)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return <div className="loading">Loading dashboard...</div>
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Royal Palms Brooklyn Shuffleboard League</p>
      </div>

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Your Team - always first */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">🏠 Your Team</h2>
          </div>
          {user && userTeam ? (
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{userTeam.name}</div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {userTeam.wins || 0}-{userTeam.losses || 0}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                {user ? 'Link your team in your profile' : 'Log in to see your team stats'}
              </p>
              <Link to={user ? '/profile' : '/login'} className="btn btn-primary">
                {user ? 'Go to Profile' : 'Log In'}
              </Link>
            </div>
          )}
        </div>

        {/* Recent Matches */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Recent Results</h2>
            <Link to="/schedule" className="btn btn-secondary btn-sm">View All</Link>
          </div>
          {recentMatches.length > 0 ? (
            <div>
              {recentMatches.map(match => (
                <div key={match.id} className="dashboard-match">
                  <div className="dashboard-match-teams">
                    <span 
                      className="dashboard-match-team"
                      style={{ 
                        color: match.winner?.id === match.team_a?.id ? 'var(--success)' : 'var(--text-primary)',
                        fontWeight: match.winner?.id === match.team_a?.id ? 600 : 400
                      }}
                    >
                      {match.team_a?.name || 'TBD'}
                    </span>
                    <span className="dashboard-match-vs">vs</span>
                    <span 
                      className="dashboard-match-team"
                      style={{ 
                        color: match.winner?.id === match.team_b?.id ? 'var(--success)' : 'var(--text-primary)',
                        fontWeight: match.winner?.id === match.team_b?.id ? 600 : 400
                      }}
                    >
                      {match.team_b?.name || 'TBD'}
                    </span>
                  </div>
                  <div className="dashboard-match-info">
                    {formatDate(match.scheduled_date)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No recent matches</p>
          )}
        </div>

        {/* Division Leaders */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">👑 Division Leaders</h2>
            <Link to="/standings" className="btn btn-secondary btn-sm">Standings</Link>
          </div>
          {divisionLeaders.length > 0 ? (
            <div>
              {divisionLeaders.map((team, index) => (
                <div key={team.id} className="dashboard-match">
                  <div className="dashboard-match-teams">
                    <Link 
                      to={`/teams/${team.id}`}
                      style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {team.name}
                    </Link>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                      {team.division}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {team.wins}-{team.losses}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No data yet</p>
          )}
        </div>

        {/* Hot Streaks */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">🔥 Hot Streaks</h2>
          </div>
          {hotStreaks.length > 0 ? (
            <div>
              {hotStreaks.map((team, index) => (
                <div key={team.id} className="dashboard-match">
                  <div className="dashboard-match-teams">
                    <Link 
                      to={`/teams/${team.id}`}
                      style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {team.name}
                    </Link>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                      {team.division}
                    </span>
                  </div>
                  <div style={{ color: 'var(--success)', fontWeight: 600 }}>
                    W{team.streak}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No hot streaks yet</p>
          )}
        </div>

        {/* Playoff Race - On The Bubble */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">🏁 Playoff Race - On The Bubble</h2>
          </div>
          {playoffBubble.length > 0 ? (
            <div>
              {playoffBubble.map((team, index) => (
                <div key={`${team.id}-${team.division}`} className="dashboard-match">
                  <div className="dashboard-match-teams">
                    <span style={{ 
                      color: team.inPlayoffs ? 'var(--success)' : 'var(--error)',
                      fontWeight: 600,
                      width: '40px',
                      flexShrink: 0,
                      fontSize: '0.85rem'
                    }}>
                      {team.inPlayoffs ? 'IN' : 'OUT'}
                    </span>
                    <Link 
                      to={`/teams/${team.id}`}
                      style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                    >
                      {team.name}
                    </Link>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                      {team.division}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {team.wins}-{team.losses}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">Season just started</p>
          )}
        </div>

        {/* Championship Leaders - now with 10 teams */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">🏆 All-Time Champions</h2>
            <Link to="/champions" className="btn btn-secondary btn-sm">Hall of Fame</Link>
          </div>
          <TopChampions />
        </div>
      </div>
    </div>
  )
}

// Sub-component for top champions - now 10 teams
function TopChampions() {
  const [teams, setTeams] = useState([])

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('teams')
        .select('id, name, championship_count')
        .gt('championship_count', 0)
        .order('championship_count', { ascending: false })
        .limit(10)
      setTeams(data || [])
    }
    fetch()
  }, [])

  if (teams.length === 0) {
    return <p className="empty-state">No championship data</p>
  }

  return (
    <div>
      {teams.map((team, index) => (
        <div key={team.id} className="dashboard-match">
          <div className="dashboard-match-teams">
            <span style={{ 
              width: '24px', 
              color: 'var(--text-muted)', 
              fontWeight: 700,
              flexShrink: 0 
            }}>
              {index + 1}
            </span>
            <Link 
              to={`/teams/${team.id}`}
              style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
            >
              {team.name}
            </Link>
          </div>
          <div style={{ color: 'var(--accent)', fontWeight: 600 }}>
            {team.championship_count}🏆
          </div>
        </div>
      ))}
    </div>
  )
}

export default Dashboard
