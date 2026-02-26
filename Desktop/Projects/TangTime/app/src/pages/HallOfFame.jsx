import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function HallOfFame() {
  const [champions, setChampions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchChampions()
  }, [])

  const fetchChampions = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name, championship_count, all_time_wins, all_time_losses, recrec_elo')
        .gt('championship_count', 0)
        .order('championship_count', { ascending: false })

      if (error) throw error
      setChampions(data || [])
    } catch (error) {
      console.error('Error fetching champions:', error)
    } finally {
      setLoading(false)
    }
  }

  const getWinPct = (wins, losses) => {
    const total = wins + losses
    if (total === 0) return '-'
    return ((wins / total) * 100).toFixed(1) + '%'
  }

  if (loading) {
    return <div className="loading">Loading champions...</div>
  }

  return (
    <div className="hall-of-fame-page">
      <div className="page-header">
        <h1 className="page-title">🏆 Hall of Fame</h1>
        <p className="page-subtitle">Championship-winning teams in Royal Palms Brooklyn history</p>
      </div>

      {champions.length > 0 ? (
        <div className="hall-of-fame-grid">
          {champions.map((team, index) => (
            <div key={team.id} className="champion-card">
              <div className="champion-rank">
                {index + 1}
              </div>
              <div className="champion-info">
                <div className="champion-name">
                  <Link to={`/teams/${team.id}`}>
                    {team.name}
                  </Link>
                </div>
                <div className="champion-stats">
                  {team.all_time_wins}-{team.all_time_losses} ({getWinPct(team.all_time_wins, team.all_time_losses)}) • ELO {team.recrec_elo || '-'}
                </div>
              </div>
              <div className="champion-trophies">
                {team.championship_count}
                <span style={{ fontSize: '1.25rem' }}>🏆</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">🏆</div>
          <p>No championship data available yet</p>
        </div>
      )}

      <div className="card" style={{ marginTop: '2rem' }}>
        <h2 className="card-title" style={{ marginBottom: '1rem' }}>About Championships</h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          Each season, the top teams from each division compete in a playoff tournament. 
          The winner earns the championship for that season. Teams listed here have won 
          at least one championship in Royal Palms Brooklyn league history.
        </p>
      </div>
    </div>
  )
}

export default HallOfFame
