import React from 'react';
const outcomes={interested:'Interested',busy:'Busy',line_busy:'Line busy',no_answer:'No answer',not_interested:'Not interested',callback_requested:'Callback requested',wrong_person:'Wrong person',human_requested:'Human follow-up requested',opt_out:'Opted out',unknown:'Unknown',meeting_booked:'Meeting booked'};
const booking={claimed:'Confirmation pending',booked:'Booked',unavailable:'Slot unavailable',reconciliation_required:'Confirmation needs review'};
const time=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):null;};
export default function CallActivity({result}){
 if(!result)return null;
 const start=result.booking?.start?time(result.booking.start):null,end=result.booking?.end?time(result.booking.end):null;
 return <section className="ot-call-result" aria-label="Saved call result"><div className="ot-statuses"><span>Call outcome: <strong>{outcomes[result.outcome]||'Not recorded'}</strong></span>
 {result.followup_pause_reason&&<span>Follow-ups: <strong>Paused · {outcomes[result.followup_pause_reason]||'Needs review'}</strong></span>}
 {result.booking&&<span>Appointment: <strong>{booking[result.booking.state]||'Not recorded'}</strong></span>}</div>
 {start&&end&&<p className="ot-next">Saved appointment: <time dateTime={result.booking.start}>{start}</time> – <time dateTime={result.booking.end}>{end}</time></p>}
 {result.callback_requested&&<p className="ot-next">Callback requested. A call has not been scheduled.</p>}
 </section>;
}
