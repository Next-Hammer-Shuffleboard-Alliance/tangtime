import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

function SubmitScore() {
  const { matchId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  
  const [matches, setMatches] = useState([])
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Score state
  const [game1TeamA, setGame1TeamA] = useState('')
  const [game1TeamB, setGame1TeamB] = useState('')
  const [game2TeamA, setGame2TeamA] = useState('')
  const [game2TeamB, setGame2TeamB] = useState('')
  const [otTeamA, setOtTeamA] = useState('')
  const [otTeamB, setOtTeamB] = useState('')
  const [needsOT, setNeedsOT] = useState(false)

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }
    fetchUpcomingMatches()
  }, [user])

  useEffect(() => {
    // Check if we need OT based on game results
    const g1Winner = parseInt(game1TeamA) > parseInt(game1TeamB) ? 'A' : 
                     parseInt(game1TeamB) > parseInt(game1TeamA) ? 'B' : null
    const g2Winner = parseInt(game2TeamA) > parseInt(game2TeamB) ? 'A' : 
                     parseInt(game2TeamB) > parseInt(game2TeamA) ? 'B' : null
    
    if (g1Winner && g2Winner && g1Winner !== g2Winner) {
      setNeedsOT(true)
    } else {
      setNeedsOT(false)
      setOtTeamA('')
      setOtTeamB('')
    }
  }, [game1TeamA, game1TeamB, game2TeamA, game2TeamB])

  const fetchUpcomingMatches = async () => {
    try {
      // Get matches that are scheduled (not yet completed)
      const { data, error } = await supabase
        .from('matches')
        .select(`
          id,
          scheduled_date,
          scheduled_time,
          court,
          status,
          team_a:teams!matches_team_a_id_fkey(id, name),
          team_b:teams!matches_team_b_id_fkey(id, name),
          division:divisions(name)
        `)
        .eq('status', 'scheduled')
        .order('scheduled_date', { ascending: true })
        .limit(20)

      if (error) throw error
      setMatches(data || [])

      if (matchId) {
        const match = data?.find(m => m.id === matchId)
        if (match) setSelectedMatch(match)
      }
    } catch (error) {
      console.error('Error fetching matches:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      // Validate scores
      const g1a = parseInt(game1TeamA) || 0
      const g1b = parseInt(game1TeamB) || 0
      const g2a = parseInt(game2TeamA) || 0
      const g2b = parseInt(game2TeamB) || 0
      const ota = parseInt(otTeamA) || 0
      const otb = parseInt(otTeamB) || 0

      // Determine game winners
      let teamAWins = 0
      let teamBWins = 0

      if (g1a > g1b) teamAWins++
      else if (g1b > g1a) teamBWins++

      if (g2a > g2b) teamAWins++
      else if (g2b > g2a) teamBWins++

      // If OT needed
      let wentToOT = false
      if (teamAWins === 1 && teamBWins === 1) {
        wentToOT = true
        if (ota > otb) teamAWins++
        else if (otb > ota) teamBWins++
      }

      // Determine overall winner
      const winnerId = teamAWins > teamBWins ? selectedMatch.team_a.id : 
                       teamBWins > teamAWins ? selectedMatch.team_b.id : null

      // Update match
      const { error: matchError } = await supabase
        .from('matches')
        .update({
          status: 'completed',
          winner_id: winnerId,
          team_a_match_wins: teamAWins,
          team_b_match_wins: teamBWins,
          went_to_ot: wentToOT,
          submitted_by: user.id,
          submitted_at: new Date().toISOString()
        })
        .eq('id', selectedMatch.id)

      if (matchError) throw matchError

      // Insert games
      const games = [
        {
          match_id: selectedMatch.id,
          game_number: 1,
          is_overtime: false,
          team_a_score: g1a,
          team_b_score: g1b,
          winner_id: g1a > g1b ? selectedMatch.team_a.id : selectedMatch.team_b.id
        },
        {
          match_id: selectedMatch.id,
          game_number: 2,
          is_overtime: false,
          team_a_score: g2a,
          team_b_score: g2b,
          winner_id: g2a > g2b ? selectedMatch.team_a.id : selectedMatch.team_b.id
        }
      ]

      if (wentToOT) {
        games.push({
          match_id: selectedMatch.id,
          game_number: 3,
          is_overtime: true,
          team_a_score: ota,
          team_b_score: otb,
          winner_id: ota > otb ? selectedMatch.team_a.id : selectedMatch.team_b.id
        })
      }

      const { error: gamesError } = await supabase
        .from('games')
        .insert(games)

      if (gamesError) throw gamesError

      setSuccess(true)
      
    } catch (error) {
      console.error('Error submitting score:', error)
      setError(error.message || 'Failed to submit score')
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric'
    })
  }

  if (!user) {
    return null
  }

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
          <h1 className="auth-title">Score Submitted!</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            The match results have been recorded.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button 
              onClick={() => {
                setSuccess(false)
                setSelectedMatch(null)
                setGame1TeamA('')
                setGame1TeamB('')
                setGame2TeamA('')
                setGame2TeamB('')
                fetchUpcomingMatches()
              }} 
              className="btn btn-secondary"
            >
              Submit Another
            </button>
            <button onClick={() => navigate('/schedule')} className="btn btn-primary">
              View Schedule
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className="loading">Loading matches...</div>
  }

  return (
    <div className="submit-score-page">
      <div className="page-header">
        <h1 className="page-title">Submit Score</h1>
        <p className="page-subtitle">Record match results</p>
      </div>

      {!selectedMatch ? (
        <div className="card">
          <h2 className="card-title" style={{ marginBottom: '1rem' }}>Select a Match</h2>
          {matches.length > 0 ? (
            <div>
              {matches.map(match => (
                <div 
                  key={match.id} 
                  className="match-card" 
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedMatch(match)}
                >
                  <div className="match-teams">
                    <span className="match-team">{match.team_a?.name}</span>
                    <span className="match-vs">vs</span>
                    <span className="match-team away">{match.team_b?.name}</span>
                  </div>
                  <div className="match-info">
                    <span className="match-time">{formatDate(match.scheduled_date)}</span>
                    <span className="match-court">{match.court}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No scheduled matches available</p>
            </div>
          )}
        </div>
      ) : (
        <div className="score-form">
          <div className="card">
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ marginBottom: '0.5rem' }}>
                {selectedMatch.team_a?.name} vs {selectedMatch.team_b?.name}
              </h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                {formatDate(selectedMatch.scheduled_date)} • {selectedMatch.court}
              </p>
              <button 
                onClick={() => setSelectedMatch(null)} 
                className="btn btn-outline"
                style={{ marginTop: '0.5rem' }}
              >
                ← Choose Different Match
              </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            <form onSubmit={handleSubmit}>
              {/* Game 1 */}
              <div className="game-section">
                <div className="game-title">Game 1</div>
                <div className="score-inputs">
                  <div className="score-team">
                    <div className="score-team-name">{selectedMatch.team_a?.name}</div>
                    <input
                      type="number"
                      className="form-input score-input"
                      value={game1TeamA}
                      onChange={(e) => setGame1TeamA(e.target.value)}
                      min="0"
                      required
                    />
                  </div>
                  <div className="score-separator">-</div>
                  <div className="score-team">
                    <div className="score-team-name">{selectedMatch.team_b?.name}</div>
                    <input
                      type="number"
                      className="form-input score-input"
                      value={game1TeamB}
                      onChange={(e) => setGame1TeamB(e.target.value)}
                      min="0"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Game 2 */}
              <div className="game-section">
                <div className="game-title">Game 2</div>
                <div className="score-inputs">
                  <div className="score-team">
                    <div className="score-team-name">{selectedMatch.team_a?.name}</div>
                    <input
                      type="number"
                      className="form-input score-input"
                      value={game2TeamA}
                      onChange={(e) => setGame2TeamA(e.target.value)}
                      min="0"
                      required
                    />
                  </div>
                  <div className="score-separator">-</div>
                  <div className="score-team">
                    <div className="score-team-name">{selectedMatch.team_b?.name}</div>
                    <input
                      type="number"
                      className="form-input score-input"
                      value={game2TeamB}
                      onChange={(e) => setGame2TeamB(e.target.value)}
                      min="0"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Overtime (if needed) */}
              {needsOT && (
                <div className="game-section" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                  <div className="game-title" style={{ color: 'var(--accent)' }}>
                    ⚡ Overtime
                  </div>
                  <div className="score-inputs">
                    <div className="score-team">
                      <div className="score-team-name">{selectedMatch.team_a?.name}</div>
                      <input
                        type="number"
                        className="form-input score-input"
                        value={otTeamA}
                        onChange={(e) => setOtTeamA(e.target.value)}
                        min="0"
                        required
                      />
                    </div>
                    <div className="score-separator">-</div>
                    <div className="score-team">
                      <div className="score-team-name">{selectedMatch.team_b?.name}</div>
                      <input
                        type="number"
                        className="form-input score-input"
                        value={otTeamB}
                        onChange={(e) => setOtTeamB(e.target.value)}
                        min="0"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Submit Score'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default SubmitScore
