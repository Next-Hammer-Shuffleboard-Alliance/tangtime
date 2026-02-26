import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

function Profile() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }
    
    setEmail(user.email || '')
    setDisplayName(user.user_metadata?.display_name || '')
  }, [user])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: displayName }
      })

      if (error) throw error
      setMessage('Profile updated successfully!')
    } catch (error) {
      setMessage('Error: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  if (!user) {
    return null
  }

  return (
    <div className="profile-page">
      <div className="page-header">
        <h1 className="page-title">Profile</h1>
        <p className="page-subtitle">Manage your account</p>
      </div>

      <div style={{ maxWidth: '500px' }}>
        <div className="card">
          <h2 className="card-title" style={{ marginBottom: '1.5rem' }}>Account Settings</h2>

          {message && (
            <div 
              className={message.startsWith('Error') ? 'error-message' : 'success-message'}
              style={!message.startsWith('Error') ? {
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid var(--success)',
                color: 'var(--success)',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                marginBottom: '1rem'
              } : {}}
            >
              {message}
            </div>
          )}

          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                value={email}
                disabled
                style={{ opacity: 0.6 }}
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Email cannot be changed
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input
                type="text"
                className="form-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                This is shown publicly on standings and scores
              </p>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h2 className="card-title" style={{ marginBottom: '1rem' }}>Account</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Sign out of your TangTime account
          </p>
          <button onClick={handleSignOut} className="btn btn-outline">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

export default Profile
