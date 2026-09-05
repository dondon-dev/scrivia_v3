export interface PasswordValidation {
  isValid: boolean;
  errors: string[];
  checks: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
  };
}

export function validatePassword(password: string): PasswordValidation {
  const checks = {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const errors: string[] = [];
  if (!checks.length) errors.push('At least 12 characters');
  if (!checks.uppercase) errors.push('At least 1 uppercase letter');
  if (!checks.lowercase) errors.push('At least 1 lowercase letter');
  if (!checks.number) errors.push('At least 1 number');
  if (!checks.special) errors.push('At least 1 special character');

  return { isValid: errors.length === 0, errors, checks };
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateMobile(mobile: string): boolean {
  return /^[+]?[\d\s\-()]{7,15}$/.test(mobile);
}
