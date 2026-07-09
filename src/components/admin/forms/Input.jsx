import React from 'react';

/**
 * Reusable Input Component
 */
const Input = ({
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  error = null,
  required = false,
  disabled = false,
  helpText = null,
  className = ''
}) => {
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label
          htmlFor={name}
          className="block text-sm font-medium text-dark-text-primary mb-2"
        >
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}

      <input
        type={type}
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-4 py-2 bg-dark-bg border rounded-lg text-dark-text-primary placeholder-dark-text-muted focus:outline-none focus:ring-2 transition-colors ${
          error
            ? 'border-red-500 focus:ring-red-500/50'
            : 'border-dark-border focus:ring-dark-text-primary/50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      />

      {helpText && !error && (
        <p className="mt-1 text-xs text-dark-text-muted">{helpText}</p>
      )}

      {error && (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
};

export default Input;
