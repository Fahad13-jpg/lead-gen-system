export const minimumPasswordLength=8;
export function validateEmailForm({mode,email,password,confirmation,acceptedTerms}){
 const errors={};
 if(typeof email!=='string'||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email.trim())||email.trim().length>254)errors.email='Enter a valid email address.';
 if(mode!=='reset'&&!password)errors.password='Enter your password.';
 if(mode==='signup'){
  if(typeof password!=='string'||password.length<minimumPasswordLength)errors.password='Use at least 8 characters for your password.';
  else if(password.length>4096)errors.password='Use a password with 4,096 characters or fewer.';
  if(!confirmation)errors.confirmation='Enter your password again.';
  else if(password!==confirmation)errors.confirmation='The passwords do not match.';
  if(acceptedTerms!==true)errors.terms='Accept the Terms and acknowledge the Privacy notice to create an account.';
 }
 return errors;
}
export function passwordPolicyMessage(status){
 const rules=[];
 if(status.meetsMinPasswordLength===false)rules.push(`at least ${status.passwordPolicy?.customStrengthOptions?.minPasswordLength||8} characters`);
 if(status.meetsMaxPasswordLength===false)rules.push(`no more than ${status.passwordPolicy?.customStrengthOptions?.maxPasswordLength||4096} characters`);
 if(status.containsLowercaseLetter===false)rules.push('a lowercase letter');
 if(status.containsUppercaseLetter===false)rules.push('an uppercase letter');
 if(status.containsNumericCharacter===false)rules.push('a number');
 if(status.containsNonAlphanumericCharacter===false)rules.push('a symbol');
 return rules.length?'Your password needs '+rules.join(', ')+'.':'Choose a password that meets the account requirements.';
}
