import React from 'react';

interface OCCCreditsCardProps {
  isAuthenticated: boolean;
  email: string | null;
  balance: number | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onBuyCredits: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export const OCCCreditsCard: React.FC<OCCCreditsCardProps> = ({
  isAuthenticated,
  email,
  balance,
  onSignIn,
  onSignOut,
  onBuyCredits,
  isLoading = false,
  error = null,
}) => {
  return (
    <div className="occ-credits-card" style={{
      padding: '16px',
      border: '1px solid #e1e1e1',
      borderRadius: '6px',
      marginBottom: '16px'
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '12px' }}>OCC Credits</h3>

      {!isAuthenticated ? (
        <div>
          <p style={{ marginBottom: '12px', fontSize: '13px', color: '#666' }}>
            Sign in to manage your credits
          </p>
          <button
            onClick={onSignIn}
            style={{
              padding: '6px 12px',
              backgroundColor: '#007ACC',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Sign In
          </button>
        </div>
      ) : error ? (
        <div>
          <p style={{ color: '#d13438', marginBottom: '8px', fontSize: '13px' }} data-testid="error">
            {error}
          </p>
          {email && (
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }} className="email" data-testid="email">
              Signed in as: {email}
            </p>
          )}
          <button
            onClick={onSignOut}
            style={{
              padding: '6px 12px',
              backgroundColor: '#d13438',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Sign Out
          </button>
        </div>
      ) : (
        <div>
          {email && (
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }} className="email" data-testid="email">
              {email}
            </p>
          )}

          {isLoading ? (
            <p style={{ fontSize: '13px', color: '#666' }}>Loading balance...</p>
          ) : (
            <div
              className="balance user-popover-balance"
              data-testid="balance"
              style={{
                fontSize: '16px',
                fontWeight: 'bold',
                marginBottom: '12px',
                color: '#333'
              }}
            >
              ${(balance ?? 0).toFixed(2)}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onBuyCredits}
              style={{
                padding: '6px 12px',
                backgroundColor: '#107C10',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                flex: 1
              }}
            >
              Buy More Credits
            </button>
            <button
              onClick={onSignOut}
              style={{
                padding: '6px 12px',
                backgroundColor: '#d13438',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OCCCreditsCard;
