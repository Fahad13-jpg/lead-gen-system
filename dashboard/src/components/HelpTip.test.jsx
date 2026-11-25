import React,{act}from'react';
import{createRoot}from'react-dom/client';
import HelpTip from'./HelpTip';
let root,host;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();jest.restoreAllMocks();});
test('help opens without submitting, closes on Escape and restores focus',()=>{
 const submit=jest.fn(e=>e.preventDefault());act(()=>root.render(<form onSubmit={submit}><label>Budget<HelpTip label="Budget">Choose your maximum spend.</HelpTip><input/></label></form>));
 const button=host.querySelector('button');expect(button.type).toBe('button');act(()=>button.click());expect(submit).not.toHaveBeenCalled();expect(host.querySelector('[role="note"]')).toBeNull();expect(button.getAttribute('aria-expanded')).toBe('true');expect(document.querySelector('[role="note"]').textContent).toContain('Choose your maximum spend.');
 act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));expect(document.querySelector('[role="note"]')).toBeNull();expect(document.activeElement).toBe(button);
});
test('outside interaction dismisses help',()=>{act(()=>root.render(<HelpTip label="Email">Recorded addresses are not verified.</HelpTip>));act(()=>host.querySelector('button').click());act(()=>document.body.dispatchEvent(new Event('pointerdown',{bubbles:true})));expect(document.querySelector('[role="note"]')).toBeNull();});

test('popup escapes transformed cards and stays inside the screen',()=>{jest.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){return this.getAttribute('role')==='note'?{height:160}:{left:1000,top:730,bottom:762};});act(()=>root.render(<div style={{transform:'translateY(0)',overflow:'hidden'}}><HelpTip label="Budget">Choose your maximum spend.</HelpTip></div>));act(()=>host.querySelector('button').click());const panel=document.querySelector('[role="note"]');expect(panel.parentElement).toBe(document.body);expect(parseFloat(panel.style.left)+parseFloat(panel.style.width)).toBeLessThanOrEqual(window.innerWidth-16);expect(parseFloat(panel.style.top)).toBe(562);});
