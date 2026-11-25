import{completeEmailCopy,emailCopyLengthError,EMAIL_OPT_OUT_LINE}from'./emailTemplateCopy';

test('adds the saved sender line and opt-out line when missing',()=>{
 expect(completeEmailCopy('Hello {{company_name}}','Fahad | Studio')).toBe('Hello {{company_name}}\n\nFahad | Studio\nReply STOP to opt out.');
});

test('keeps a valid ending and does not duplicate the opt-out line',()=>{
 const value='Hello\n\nFahad | Studio\n'+EMAIL_OPT_OUT_LINE+'\n';
 expect(completeEmailCopy(value,'Fahad | Studio')).toBe(value.trimEnd());
});

test('adds missing lines before a saved opt-out line',()=>{
 expect(completeEmailCopy(`Hello\n${EMAIL_OPT_OUT_LINE}`,'Fahad | Studio')).toBe(`Hello\n\nFahad | Studio\n${EMAIL_OPT_OUT_LINE}`);
});

test('checks the final message length after adding required lines',()=>{
 expect(emailCopyLengthError('x'.repeat(1200),'Fahad | Studio')).toMatch(/1,200/);
 expect(emailCopyLengthError('Hello','Fahad | Studio')).toBe('');
});
