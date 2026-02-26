import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function Navbar() {
  const location = useLocation()
  const { user, signOut } = useAuth()

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(path)
  }

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <nav className="navbar">
      <div className="navbar-content">
        <Link to="/" className="navbar-brand">
          <span className="tang">Tang</span>
          <span className="time">Time</span>
        </Link>

        <div className="navbar-links">
          <Link to="/" className={isActive('/') ? 'active' : ''}>
            Dashboard
          </Link>
          <Link to="/standings" className={isActive('/standings') ? 'active' : ''}>
            Standings
          </Link>
          <Link to="/schedule" className={isActive('/schedule') ? 'active' : ''}>
            Schedule
          </Link>
          <Link to="/teams" className={isActive('/teams') ? 'active' : ''}>
            Teams
          </Link>
          {user && (
            <Link to="/submit-score" className={isActive('/submit-score') ? 'active' : ''}>
              Submit Score
            </Link>
          )}
        </div>

        <div className="navbar-auth">
          {user ? (
            <>
              <Link to="/profile" className="btn btn-secondary">
                Profile
              </Link>
              <button onClick={handleSignOut} className="btn btn-outline">
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-secondary">
                Log In
              </Link>
              <Link to="/signup" className="btn btn-primary">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

export default Navbar
