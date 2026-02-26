import { Link } from 'react-router-dom'

function Terms() {
  return (
    <div className="terms-page">
      <div className="page-header">
        <h1 className="page-title">Terms of Service</h1>
        <p className="page-subtitle">Last updated: February 2026</p>
      </div>

      <div className="terms-content card">
        <h2>1. Acceptance of Terms</h2>
        <p>
          By creating an account on TangTime, you agree to these Terms of Service. 
          If you do not agree to these terms, please do not create an account.
        </p>

        <h2>2. Account Information</h2>
        <p>
          When you create an account, you provide us with your email address and a display name. 
          Your display name will be publicly visible to other users in the following contexts:
        </p>
        <ul>
          <li>League standings and rankings</li>
          <li>Match results and schedules</li>
          <li>Team rosters</li>
          <li>Player statistics</li>
        </ul>
        <p>
          You are responsible for maintaining the confidentiality of your account credentials. 
          Please choose a display name you are comfortable having publicly visible.
        </p>

        <h2>3. Privacy & Data Usage</h2>
        <p>
          TangTime is a platform for tracking shuffleboard league statistics at Royal Palms Brooklyn. 
          We collect and display:
        </p>
        <ul>
          <li>Your display name (publicly visible)</li>
          <li>Your email address (private, used for login only)</li>
          <li>Match results and scores you submit</li>
          <li>Team affiliations and roster information</li>
        </ul>
        <p>
          We do not sell your personal information to third parties. Your email address 
          is only used for account authentication and important service notifications.
        </p>

        <h2>4. User Conduct</h2>
        <p>
          You agree to:
        </p>
        <ul>
          <li>Provide accurate match scores and results</li>
          <li>Not impersonate other players or teams</li>
          <li>Not attempt to manipulate standings or statistics</li>
          <li>Use the platform in good faith for its intended purpose</li>
        </ul>

        <h2>5. Score Submission</h2>
        <p>
          Team captains are responsible for submitting accurate match results. 
          Disputed scores should be reported to league administrators for resolution. 
          TangTime reserves the right to correct or remove inaccurate data.
        </p>

        <h2>6. Data Accuracy</h2>
        <p>
          Historical data has been imported from previous league management systems. 
          While we strive for accuracy, some historical records may be incomplete. 
          If you notice any errors in team or player statistics, please contact us.
        </p>

        <h2>7. Account Termination</h2>
        <p>
          You may delete your account at any time by contacting us. 
          We reserve the right to suspend or terminate accounts that violate these terms.
        </p>

        <h2>8. Changes to Terms</h2>
        <p>
          We may update these terms from time to time. Continued use of TangTime 
          after changes constitutes acceptance of the new terms.
        </p>

        <h2>9. Contact</h2>
        <p>
          For questions about these terms or the TangTime platform, please reach out 
          to the league administrators at Royal Palms Brooklyn.
        </p>

        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
          <Link to="/signup" className="btn btn-primary">
            ← Back to Sign Up
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Terms
