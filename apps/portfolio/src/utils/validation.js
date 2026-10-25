/**
 * Validation utilities for form inputs
 */

/**
 * Check if a value is empty
 */
export const isEmpty = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

/**
 * Validate required field
 */
export const validateRequired = (value, fieldName = 'This field') => {
  if (isEmpty(value)) {
    return `${fieldName} is required`;
  }
  return null;
};

/**
 * Validate URL format
 */
export const validateURL = (value, required = false) => {
  if (!required && isEmpty(value)) return null;

  if (isEmpty(value)) return 'URL is required';

  try {
    new URL(value);
    return null;
  } catch {
    return 'Please enter a valid URL';
  }
};

/**
 * Validate email format
 */
export const validateEmail = (value, required = false) => {
  if (!required && isEmpty(value)) return null;

  if (isEmpty(value)) return 'Email is required';

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    return 'Please enter a valid email address';
  }
  return null;
};

/**
 * Validate date format (YYYY-MM)
 */
export const validateDate = (value, required = false) => {
  if (!required && isEmpty(value)) return null;

  if (isEmpty(value)) return 'Date is required';

  const dateRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!dateRegex.test(value)) {
    return 'Please enter a valid date in YYYY-MM format';
  }
  return null;
};

/**
 * Validate number range
 */
export const validateNumberRange = (value, min, max, fieldName = 'This field') => {
  if (isEmpty(value)) return `${fieldName} is required`;

  const num = Number(value);
  if (isNaN(num)) return `${fieldName} must be a number`;

  if (min !== undefined && num < min) {
    return `${fieldName} must be at least ${min}`;
  }

  if (max !== undefined && num > max) {
    return `${fieldName} must be at most ${max}`;
  }

  return null;
};

/**
 * Validate array has at least one item
 */
export const validateArrayNotEmpty = (value, fieldName = 'This field') => {
  if (!Array.isArray(value) || value.length === 0) {
    return `${fieldName} must have at least one item`;
  }
  return null;
};

/**
 * Validate slug format (URL-friendly string)
 */
export const validateSlug = (value) => {
  if (isEmpty(value)) return 'Slug is required';

  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(value)) {
    return 'Slug must be lowercase letters, numbers, and hyphens only';
  }
  return null;
};

/**
 * Validate all fields in a form
 * @param {object} values - Form values
 * @param {object} rules - Validation rules { fieldName: [validator1, validator2, ...] }
 * @returns {object} - Errors object { fieldName: errorMessage }
 */
export const validateForm = (values, rules) => {
  const errors = {};

  Object.keys(rules).forEach(fieldName => {
    const validators = rules[fieldName];
    const value = values[fieldName];

    // Run all validators for this field
    for (const validator of validators) {
      const error = validator(value);
      if (error) {
        errors[fieldName] = error;
        break; // Stop at first error
      }
    }
  });

  return errors;
};

/**
 * Check if form has any errors
 */
export const hasErrors = (errors) => {
  return Object.keys(errors).length > 0;
};
