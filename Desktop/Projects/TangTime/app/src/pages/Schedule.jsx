import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function Schedule() {
  const [seasons, setSeasons] = useState([])
  const [divisions, setDivisions] = useState([])
  const [allMatches, setAllMatches] = useState([])
  const [dates, setDates] = useState([])
  const [selectedSeason, setSelectedSeason] = useState(null)
  const [selectedDivision, setSelectedDivision] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
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
      fetchMatches(selectedDivision.id)
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

  const fetchMatches = async (divisionId) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          id,
          scheduled_date,
          scheduled_time,
          court,
          status,
          team_a_match_wins,
          team_b_match_wins,
          went_to_ot,
          team_a:teams!matches_team_a_id_fkey(id, name),
          team_b:teams!matches_team_b_id_fkey(id, name),
          winner:teams!matches_winner_id_fkey(id, name)
        `)
        .eq('division_id', divisionId)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true })

      if (error) throw error

      setAllMatches(data || [])

      // Extract unique dates
      const uniqueDates = [...new Set(data?.map(m => m.scheduled_date).filter(Boolean))]
      setDates(uniqueDates)

      // Auto-select first date or date closest to today
      if (uniqueDates.length > 0) {
        const today = new Date().toISOString().split('T')[0]
        const futureDate = uniqueDates.find(d => d >= today)
        setSelectedDate(futureDate || uniqueDates[uniqueDates.length - 1])
      } else {
        setSelectedDate(null)
      }
    } catch (error) {
      console.error('Error fetching matches:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unscheduled'
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatShortDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    })
  }

  const formatTime = (timeStr) => {
    if (!timeStr) return ''
    const [hours, minutes] = timeStr.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}:${minutes} ${ampm}`
  }

  const currentDateIndex = dates.indexOf(selectedDate)
  const canGoPrev = currentDateIndex > 0
  const canGoNext = currentDateIndex < dates.length - 1

  const filteredMatches = allMatches.filter(m => m.scheduled_date === selectedDate)

  return (
    <div className="schedule-page">
      <div className="page-header">
        <h1 className="page-title">Schedule</h1>
        <p className="page-subtitle">Weekly matchups and results</p>
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

      {/* Week/Date Navigation */}
      {dates.length > 0 && (
        <div className="week-nav">
          <div className="week-nav-arrows">
            <button 
              className="week-nav-btn"
              onClick={() => setSelectedDate(dates[currentDateIndex - 1])}
              disabled={!canGoPrev}
            >
              ←
            </button>
            <div className="week-nav-current">
              {formatDate(selectedDate)}
            </div>
            <button 
              className="week-nav-btn"
              onClick={() => setSelectedDate(dates[currentDateIndex + 1])}
              disabled={!canGoNext}
            >
              →
            </button>
          </div>
          
          <div className="week-dates">
            {dates.map(date => (
              <button
                key={date}
                className={`week-date-btn ${selectedDate === date ? 'active' : ''}`}
                onClick={() => setSelectedDate(date)}
              >
                {formatShortDate(date)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Matches */}
      {loading ? (
        <div className="loading">Loading schedule...</div>
      ) : filteredMatches.length > 0 ? (
        <div>
          {filteredMatches.map(match => {
            const isCompleted = match.status === 'completed'
            const teamAWon = match.winner?.id === match.team_a?.id
            const teamBWon = match.winner?.id === match.team_b?.id

            return (
              <div key={match.id} className="match-card">
                <div className="match-teams">
                  <span 
                    className="match-team"
                    style={{ 
                      fontWeight: teamAWon ? 700 : 500,
                      color: teamAWon ? 'var(--success)' : 'var(--text-primary)'
                    }}
                  >
                    <Link to={`/teams/${match.team_a?.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {match.team_a?.name || 'TBD'}
                    </Link>
                  </span>
                  <span className="match-vs">vs</span>
                  <span 
                    className="match-team away"
                    style={{ 
                      fontWeight: teamBWon ? 700 : 500,
                      color: teamBWon ? 'var(--success)' : 'var(--text-primary)'
                    }}
                  >
                    <Link to={`/teams/${match.team_b?.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {match.team_b?.name || 'TBD'}
                    </Link>
                  </span>
                </div>
                <div className="match-info">
                  {isCompleted ? (
                    <>
                      {match.went_to_ot && (
                        <span style={{ 
                          background: 'var(--accent)', 
                          color: 'var(--bg-primary)',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>
                          OT
                        </span>
                      )}
                      <span className="match-court">{match.court}</span>
                    </>
                  ) : (
                    <>
                      <span className="match-time">{formatTime(match.scheduled_time)}</span>
                      <span className="match-court">{match.court}</span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <p>No matches for this date</p>
        </div>
      )}
    </div>
  )
}

export default Schedule
