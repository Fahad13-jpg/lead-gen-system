import {readErrorMessage} from './requestError';
test.each([[401,'session'],[403,'workspace'],[404,'could not be found'],[429,'Too many requests'],[500,'temporarily unavailable'],[503,'temporarily unavailable']])('HTTP %s gives a recoverable message without leaking server errors',(status,text)=>{
 const message=readErrorMessage({response:{status,data:{error:'PRIVATE_INTERNAL_VALUE'}}});expect(message).toContain(text);expect(message).not.toContain('PRIVATE_INTERNAL_VALUE');
});
test('timeouts warn against blindly resubmitting pending actions',()=>{expect(readErrorMessage({code:'ECONNABORTED'})).toContain('Check any pending action');});
