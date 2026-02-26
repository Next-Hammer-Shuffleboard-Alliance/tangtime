import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function Teams() {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('elo')  // Changed default to ELO

  useEffect(() => {
    fetchTeams()
  }, [sortBy])

  const fetchTeams = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('teams')
        .select('*')

      // Apply sorting
      switch (sortBy) {
        case 'championships':
          query = query.order('championship_count', { ascending: false })
          break
        case 'elo':
          query = query.order('recrec_elo', { ascending: false, nullsFirst: false })
          break
        case 'wins':
          query = query.order('all_time_wins', { ascending: false })
          break
        case 'name':
          query = query.order('name', { ascending: true })
          break
        default:
          query = query.order('recrec_elo', { ascending: false, nullsFirst: false })
      }

      const { data, error } = await query

      if (error) throw error
      setTeams(data || [])
    } catch (error) {
      console.error('Error fetching teams:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredTeams = teams.filter(team =>
    team.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getWinPct = (wins, losses) => {
    const total = wins + losses
    if (total === 0) return '-'
    return ((wins / total) * 100).toFixed(1) + '%'
  }

  return (
    <div className="teams-page">
      <div className="page-header">
        <h1 className="page-title">Teams</h1>
        <p className="page-subtitle">All teams in Royal Palms Brooklyn history</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search teams..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ minWidth: '180px', marginBottom: 0 }}>
          <select
            className="form-input"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="elo">Sort by ELO</option>
            <option value="championships">Sort by Championships</option>
            <option value="wins">Sort by Wins</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>
      </div>

      {/* Teams Grid */}
      {loading ? (
        <div className="loading">Loading teams...</div>
      ) : filteredTeams.length > 0 ? (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Record</th>
                  <th>Win %</th>
                  <th>ELO</th>
                  <th>🏆</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeams.map(team => (
                  <tr key={team.id}>
                    <td className="team-name">
                      <Link to={`/teams/${team.id}`}>
                        {team.name}
                      </Link>
                    </td>
                    <td className="team-record">
                      {team.all_time_wins || 0}-{team.all_time_losses || 0}
                    </td>
                    <td>
                      {getWinPct(team.all_time_wins || 0, team.all_time_losses || 0)}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {team.recrec_elo || '-'}
                    </td>
                    <td>
                      {team.championship_count > 0 && (
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                          {team.championship_count}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <p>No teams found matching "{searchTerm}"</p>
        </div>
      )}

      <p style={{ color: 'var(--text-muted)', marginTop: '1rem', textAlign: 'center' }}>
        Showing {filteredTeams.length} of {teams.length} teams
      </p>
    </div>
  )
}

export default Teams
