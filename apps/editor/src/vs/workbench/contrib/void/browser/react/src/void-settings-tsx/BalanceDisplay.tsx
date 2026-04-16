import React from 'react';

interface BalanceDisplayProps {
  balance: number | null;
  isLoading?: boolean;
  className?: string;
}

export const BalanceDisplay: React.FC<BalanceDisplayProps> = ({
  balance,
  isLoading = false,
  className = '',
}) => {
  if (isLoading) {
    return (
      <div className={`balance user-popover-balance ${className}`.trim()} data-testid="balance">
        <span style={{ fontSize: '12px', color: '#999' }}>Loading...</span>
      </div>
    );
  }

  const displayBalance = balance !== null ? `$${balance.toFixed(2)}` : '—';

  return (
    <div
      className={`balance user-popover-balance ${className}`.trim()}
      data-testid="balance"
      style={{
        fontSize: '14px',
        fontWeight: 'normal',
        color: '#333',
        padding: '4px 8px',
        borderRadius: '4px',
        backgroundColor: '#f5f5f5',
        display: 'inline-block',
        minWidth: '80px',
        textAlign: 'center'
      }}
    >
      {displayBalance}
    </div>
  );
};

export default BalanceDisplay;
