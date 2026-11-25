export function readErrorMessage(error){
 const status=error?.response?.status;
 if(status===401)return 'Your session could not be verified. Sign out and sign in again.';
 if(status===403)return 'You do not have access to this action in the selected workspace. Check your role and package in Settings.';
 if(status===404)return 'This record could not be found in your workspace. Return to the list and choose another record.';
 if(status===429)return 'Too many requests. Wait a moment before checking again.';
 if(status===500||status===502||status===503||status===504)return 'The service is temporarily unavailable. Try again shortly. Check any pending action before submitting it again.';
 if(error?.code==='ECONNABORTED'||error?.code==='ETIMEDOUT')return 'The request took too long. Check any pending action before trying again.';
 return 'Could not refresh this list. Check your connection and try again; previously loaded records may be out of date.';
}
