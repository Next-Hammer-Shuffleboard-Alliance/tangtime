import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function Standings() {
  const { divisionId } = useParams()
  const [seasons, setSeasons] = useState([])
  const [divisions, setDivisions] = useState([])
  const [standings, setStandings] = useState([])
  const [selectedSeason, setSelectedSeason] = useState(null)
  const [selectedDivision, setSelectedDivision] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSeasons()
  }, [])

  useEffect(() => {
    if (selectedSeason) {
      fetchDivisions(selectedSeason.id)
    }
  }, [selectedSeason])

  useEffect(() => {
    if (selectedDivision) {
      fetchStandings(selectedDivision.id)
    }
  }, [selectedDivision])

  const fetchSeasons = async () => {
    try {
      const { data, error } = await supabase
        .from('seasons')
        .select('*')
        .order('start_date', { ascending: false })

      if (error) throw error

      setSeasons(data || [])
      
      if (data && data.length > 0) {
        setSelectedSeason(data[0])
      }
    } catch (error) {
      console.error('Error fetching seasons:', error)
    }
  }

  const fetchDivisions = async (seasonId) => {
    try {
      const { data, error } = await supabase
        .from('divisions')
        .select('*')
        .eq('season_id', seasonId)
        .order('day_of_week')
        .order('level')

      if (error) throw error

      setDivisions(data || [])
      
      if (data && data.length > 0) {
        setSelectedDivision(data[0])
      }
    } catch (error) {
      console.error('Error fetching divisions:', error)
    }
  }

  const fetchStandings = async (divisionId) => {
    setLoading(true)
    try {
      const { data: matchData, error } = await supabase
        .from('matches')
        .select(`
          id,
          team_a_id,
          team_b_id,
          winner_id,
          went_to_ot,
          status,
          scheduled_date,
          team_a:teams!matches_team_a_id_fkey(id, name),
          team_b:teams!matches_team_b_id_fkey(id, name)
        `)
        .eq('division_id', divisionId)
        .order('scheduled_date', { ascending: true })

      if (error) throw error

      const teamStats = new Map()
      const teamMatchHistory = new Map()

      matchData?.forEach(match => {
        if (match.team_a && !teamStats.has(match.team_a.id)) {
          teamStats.set(match.team_a.id, {
            team: match.team_a,
            wins: 0,
            losses: 0,
            otGames: 0
          })
          teamMatchHistory.set(match.team_a.id, [])
        }
        if (match.team_b && !teamStats.has(match.team_b.id)) {
          teamStats.set(match.team_b.id, {
            team: match.team_b,
            wins: 0,
            losses: 0,
            otGames: 0
          })
          teamMatchHistory.set(match.team_b.id, [])
        }

        if (match.status === 'completed' && match.winner_id) {
          const winnerId = match.winner_id
          const loserId = match.team_a_id === winnerId ? match.team_b_id : match.team_a_id

          if (teamStats.has(winnerId)) {
            const winnerStats = teamStats.get(winnerId)
            winnerStats.wins++
            if (match.went_to_ot) winnerStats.otGames++
            teamMatchHistory.get(winnerId)?.push('W')
          }

          if (teamStats.has(loserId)) {
            const loserStats = teamStats.get(loserId)
            loserStats.losses++
            if (match.went_to_ot) loserStats.otGames++
            teamMatchHistory.get(loserId)?.push('L')
          }
        }
      })

      const calculateStreak = (history) => {
        if (history.length === 0) return '-'
        const lastResult = history[history.length - 1]
        let count = 0
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i] === lastResult) count++
          else break
        }
        return `${lastResult}${count}`
      }

      // Sort by wins, then fewer losses
      const standingsArray = Array.from(teamStats.values())
        .map(stats => ({
          ...stats,
          streak: calculateStreak(teamMatchHistory.get(stats.team.id) || [])
        }))
        .sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins
          return a.losses - b.losses
        })

      // Calculate GB from first place
      if (standingsArray.length > 0) {
        const leader = standingsArray[0]
        standingsArray.forEach(team => {
          const gb = ((leader.wins - team.wins) + (team.losses - leader.losses)) / 2
          team.gb = gb === 0 ? '-' : gb.toFixed(1).replace('.0', '')
        })
      }

      // Calculate tied rankings
      let currentRank = 1
      standingsArray.forEach((team, index) => {
        if (index === 0) {
          team.rank = 1
          team.displayRank = '1'
        } else {
          const prev = standingsArray[index - 1]
          // Same record = tied
          if (team.wins === prev.wins && team.losses === prev.losses) {
            team.rank = prev.rank
          } else {
            team.rank = index + 1
          }
        }
      })

      // Now set displayRank with T prefix for ties
      const rankCounts = {}
      standingsArray.forEach(team => {
        rankCounts[team.rank] = (rankCounts[team.rank] || 0) + 1
      })
      
      standingsArray.forEach(team => {
        if (rankCounts[team.rank] > 1) {
          team.displayRank = `T${team.rank}`
        } else {
          team.displayRank = `${team.rank}`
        }
      })

      // Determine playoff eligibility (top 5 positions)
      // A team is in playoffs if their actual position (index + 1) <= 5
      // OR if they're tied with someone in top 5
      standingsArray.forEach((team, index) => {
        // Position is index + 1
        // If rank <= 5, they're in playoff contention
        // But we need to check: if rank is 5 and there are ties, all tied teams make it
        team.position = index + 1
        team.inPlayoffs = team.rank <= 5
      })

      setStandings(standingsArray)
    } catch (error) {
      console.error('Error fetching standings:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="standings-page">
      <div className="page-header">
        <h1 className="page-title">Standings</h1>
        <p className="page-subtitle">Season standings and team rankings</p>
      </div>

      {/* Season Selector */}
      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label className="form-label">Season</label>
        <select 
          className="form-input"
          value={selectedSeason?.id || ''}
          onChange={(e) => {
            const season = seasons.find(s => s.id === e.target.value)
            setSelectedSeason(season)
          }}
        >
          {seasons.map(season => (
            <option key={season.id} value={season.id}>
              {season.name}
            </option>
          ))}
        </select>
      </div>

      {/* Division Selector */}
      <div className="division-selector">
        {divisions.map(div => (
          <button
            key={div.id}
            className={`division-btn ${selectedDivision?.id === div.id ? 'active' : ''}`}
            onClick={() => setSelectedDivision(div)}
          >
            {div.name}
          </button>
        ))}
      </div>

      {/* Standings Table */}
      {loading ? (
        <div className="loading">Loading standings...</div>
      ) : standings.length > 0 ? (
        <div className="card">
          <div className="table-container">
            <table className="standings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>W</th>
                  <th>L</th>
                  <th>GB</th>
                  <th>Streak</th>
                  <th>OT</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, index) => (
                  <tr 
                    key={row.team?.id || index}
                    style={{
                      backgroundColor: row.inPlayoffs ? 'rgba(16, 185, 129, 0.1)' : 'transparent'
                    }}
                  >
                    <td className="team-rank">{row.displayRank}</td>
                    <td className="team-name">
                      <Link to={`/teams/${row.team?.id}`}>
                        {row.team?.name || 'Unknown Team'}
                      </Link>
                    </td>
                    <td>{row.wins}</td>
                    <td>{row.losses}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{row.gb}</td>
                    <td style={{ 
                      color: row.streak.startsWith('W') ? 'var(--success)' : 
                             row.streak.startsWith('L') ? 'var(--error)' : 'var(--text-muted)'
                    }}>
                      {row.streak}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{row.otGames || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ 
            color: 'var(--text-muted)', 
            fontSize: '0.85rem', 
            marginTop: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ 
              width: '12px', 
              height: '12px', 
              backgroundColor: 'rgba(16, 185, 129, 0.3)',
              borderRadius: '2px',
              display: 'inline-block'
            }}></span>
            Top 5 qualify for playoffs
          </p>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <p>No standings data available for this division</p>
        </div>
      )}
    </div>
  )
}

export default Standings
