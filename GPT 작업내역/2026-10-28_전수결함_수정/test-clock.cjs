// Local isolated E2E fixture only. Never configured in production.
if (process.env.JSP_CHECK_NOW) {
 const RealDate=Date, shift=RealDate.parse(process.env.JSP_CHECK_NOW)-RealDate.now();
 global.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[RealDate.now()+shift]));} static now(){return RealDate.now()+shift;} static parse(value){return RealDate.parse(value);} static UTC(...args){return RealDate.UTC(...args);}};
}
