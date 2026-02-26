import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function TeamDetail() {
  const { teamId } = useParams()
  const [team, setTeam] = useState(null)
  const [matches, setMatches] = useState([])
  const [activeTab, setActiveTab] = useState('matches')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (teamId) {
      fetchTeam()
      fetchMatches()
    }
  }, [teamId])

  const fetchTeam = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single()

      if (error) throw error
      setTeam(data)
    } catch (error) {
      console.error('Error fetching team:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchMatches = async () => {
    try {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          id,
          scheduled_date,
          court,
          status,
          team_a_match_wins,
          team_b_match_wins,
          went_to_ot,
          team_a:teams!matches_team_a_id_fkey(id, name),
          team_b:teams!matches_team_b_id_fkey(id, name),
          winner:teams!matches_winner_id_fkey(id, name),
          division:divisions(name, season:seasons(name))
        `)
        .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
        .order('scheduled_date', { ascending: false })
        .limit(50)

      if (error) throw error
      setMatches(data || [])
    } catch (error) {
      console.error('Error fetching matches:', error)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getWinPct = (wins, losses) => {
    const total = wins + losses
    if (total === 0) return '0%'
    return ((wins / total) * 100).toFixed(1) + '%'
  }

  const getOpponent = (match) => {
    if (match.team_a?.id === teamId) {
      return match.team_b
    }
    return match.team_a
  }

  const isWin = (match) => {
    return match.winner?.id === teamId
  }

  const getMatchScore = (match) => {
    if (match.status !== 'completed') return null
    
    const isTeamA = match.team_a?.id === teamId
    const wins = isTeamA ? match.team_a_match_wins : match.team_b_match_wins
    const losses = isTeamA ? match.team_b_match_wins : match.team_a_match_wins
    
    // Show dash if no game-level data recorded
    if (wins === 0 && losses === 0) {
      return '—'
    }
    
    return `${wins}-${losses}`
  }

  if (loading) {
    return <div className="loading">Loading team...</div>
  }

  if (!team) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🔍</div>
        <p>Team not found</p>
        <Link to="/teams" className="btn btn-primary" style={{ marginTop: '1rem' }}>
          View All Teams
        </Link>
      </div>
    )
  }

  return (
    <div className="team-detail-page">
      {/* Team Header */}
      <div className="team-header">
        <div className="team-logo">
          🏆
        </div>
        <div className="team-info">
          <h1>{team.name}</h1>
          <div className="team-stats">
            <div className="team-stat">
              <span className="team-stat-value">{team.all_time_wins || 0}-{team.all_time_losses || 0}</span>
              <span className="team-stat-label">All-Time Record</span>
            </div>
            <div className="team-stat">
              <span className="team-stat-value">{getWinPct(team.all_time_wins || 0, team.all_time_losses || 0)}</span>
              <span className="team-stat-label">Win Rate</span>
            </div>
            <div className="team-stat">
              <span className="team-stat-value">{team.recrec_elo || '-'}</span>
              <span className="team-stat-label">ELO Rating</span>
            </div>
          </div>
          {team.championship_count > 0 && (
            <div className="championship-badge">
              🏆 {team.championship_count} Championship{team.championship_count > 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'matches' ? 'active' : ''}`}
          onClick={() => setActiveTab('matches')}
        >
          Recent Matches
        </button>
        <button 
          className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          Stats
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'matches' && (
        <div className="card">
          {matches.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Opponent</th>
                    <th>Result</th>
                    <th>Score</th>
                    <th>Division</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map(match => {
                    const opponent = getOpponent(match)
                    const won = isWin(match)
                    const score = getMatchScore(match)
                    
                    return (
                      <tr key={match.id}>
                        <td>{formatDate(match.scheduled_date)}</td>
                        <td className="team-name">
                          <Link to={`/teams/${opponent?.id}`}>
                            {opponent?.name || 'TBD'}
                          </Link>
                        </td>
                        <td>
                          {match.status === 'completed' ? (
                            <span style={{ 
                              color: won ? 'var(--success)' : 'var(--error)',
                              fontWeight: 600
                            }}>
                              {won ? 'W' : 'L'}
                              {match.went_to_ot && ' (OT)'}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>
                              Scheduled
                            </span>
                          )}
                        </td>
                        <td style={{ color: score === '—' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                          {score || '—'}
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {match.division?.name}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <p>No match history found</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="dashboard-grid">
          <div className="stat-card">
            <div className="stat-value">{team.all_time_wins || 0}</div>
            <div className="stat-label">Total Wins</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{team.all_time_losses || 0}</div>
            <div className="stat-label">Total Losses</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{team.all_time_ot_wins || 0}</div>
            <div className="stat-label">OT Wins</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{team.all_time_ot_losses || 0}</div>
            <div className="stat-label">OT Losses</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{team.playoff_appearances || 0}</div>
            <div className="stat-label">Playoff Appearances</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--accent)' }}>
              {team.championship_count || 0}
            </div>
            <div className="stat-label">Championships</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TeamDetail
