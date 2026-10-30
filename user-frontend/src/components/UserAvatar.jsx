import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';

/**
 * Circular User Avatar component
 * Displays user's profile image, or fallback initials, or a fallback User icon.
 */
const UserAvatar = ({
  user,
  src,
  name,
  size = 36,
  fontSize,
  border = '1.5px solid #8B5CF6',
  backgroundColor = '#EEE7F4',
  color = '#5C187B',
  className = '',
  style = {},
  alt,
  title,
}) => {
  const [imageError, setImageError] = useState(false);

  const imgSrc = src !== undefined ? src : user?.profileImage || user?.avatar;
  const displayName = name || user?.name || '';

  // Reset image error state whenever imgSrc changes
  useEffect(() => {
    setImageError(false);
  }, [imgSrc]);

  // Derive initials from user name (e.g., "John Doe" -> "JD", "Alen" -> "AL")
  const getInitials = (str) => {
    if (!str || typeof str !== 'string') return '';
    const clean = str.trim();
    if (!clean) return '';
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const initials = getInitials(displayName);
  const calculatedFontSize = fontSize || `${Math.max(10, Math.round(size * 0.38))}px`;
  const iconSize = Math.max(14, Math.round(size * 0.52));

  return (
    <div
      className={`flowly-avatar ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        borderRadius: '50%',
        backgroundColor: backgroundColor,
        color: color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        border: border,
        position: 'relative',
        userSelect: 'none',
        flexShrink: 0,
        ...style,
      }}
      title={title || displayName || 'User Avatar'}
    >
      {imgSrc && !imageError ? (
        <img
          src={imgSrc}
          alt={alt || displayName || 'User avatar'}
          onError={() => setImageError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '50%',
            display: 'block',
          }}
        />
      ) : initials ? (
        <span
          style={{
            fontWeight: 700,
            fontSize: calculatedFontSize,
            lineHeight: 1,
            letterSpacing: '0.02em',
          }}
        >
          {initials}
        </span>
      ) : (
        <User size={iconSize} color={color} />
      )}
    </div>
  );
};

export default UserAvatar;
