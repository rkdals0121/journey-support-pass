// Only preload in an isolated, local screenshot server. Never imported by application code.
if(process.env.DESIGN_FIXED_CLOCK==='1') {
 const NativeDate=Date, epoch=NativeDate.parse('2026-10-28T06:45:00Z'), started=performance.now();
 const now=()=>epoch+performance.now()-started;
 function DesignDate(...args){if(!new.target)return new NativeDate(now()).toString();return Reflect.construct(NativeDate,args.length?args:[now()],new.target);}
 Object.setPrototypeOf(DesignDate,NativeDate);DesignDate.prototype=NativeDate.prototype;DesignDate.now=now;globalThis.Date=DesignDate;
}
