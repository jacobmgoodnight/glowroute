/** Limited factual address catalogs, credited to the original publishers. These are snapshots, not live feeds. */
export const DIRECTORIES=[
 {name:'Indy with Kids · Halloween 2026',url:'https://indywithkids.com/decorated-halloween-houses/',season:'Halloween',year:2026,id:'indy-halloween'},
 {name:'Indy with Kids · Christmas 2025 (archive)',url:'https://indywithkids.com/christmas-lights-list-indianapolis-central-indiana/',season:'Christmas',year:2025,id:'indy-christmas'},
 {name:'FrightMaps · Halloween directory',url:'https://frightmaps.com/',season:'Halloween',year:2026,id:'frightmaps'},
 {name:'ChristmasPrism · Christmas directory',url:'https://www.christmasprism.com/',season:'Christmas',year:2026,id:'christmasprism'},
 {name:'Holiday Light Finder',url:'https://www.holidaylightfinder.com/',season:'Christmas',year:2026,id:'holidaylightfinder'}
];
const irvington=[
 ['Ritter Avenue','908 N Ritter Ave'],['Ritter Avenue','509 N Ritter Ave'],['Ritter Avenue','338 N Ritter Ave'],['Ritter Avenue','66 N Ritter Ave'],['Ritter Avenue','107 S Ritter Ave'],['Webster Avenue','12 N Webster Ave'],['Clown-Themed House on Webster','318 S Webster Ave'],['Audubon Road','58 N Audubon Rd'],['Hawthorne Lane','59 N Hawthorne Ln'],['Irvington Avenue','38 N Irvington Ave'],['Lesley Avenue','352 N Lesley Ave'],['Lesley Avenue','819 N Lesley Ave'],['Graham Avenue','917 N Graham Ave'],['Bolton Avenue','932 N Bolton Ave'],['Butler Avenue','304 S Butler Ave'],['Sheridan Avenue','322 S Sheridan Ave'],['East New York Street','5801 E New York St'],['Julian Avenue','5821 Julian Ave'],['Beechwood Avenue','5843 E Beechwood Ave']
];
const christmas2025=[
 ['Meadow Lake Drive Light Display','13959 Meadow Lake Drive, Fishers, Indiana'],
 ['McDowell Drive Lights','13738 McDowell Drive, Fishers, Indiana'],
 ['Pearce Place Lights','11210 Pearce Place, Fishers, Indiana'],
 ['Lights on Candice Dr','11377 Candice Dr, Fishers, Indiana'],
 ['Panthers Way Lights','12804 Panthers Way, Fishers, Indiana'],
 ['Chiefs Court Lights','12601 Chiefs Ct, Fishers, Indiana'],
 ['Belle Plaine Lights','11877 Belle Plaine Blvd, Fishers, Indiana'],
 ['Rockingham Circle Lights','11180 Rockingham Circle, Fishers, Indiana'],
 ['Midnight Pass Lights','10871 Midnight Pass, Fishers, Indiana'],
 ['Calibouge Drive Lights','10475 Calibouge Dr, Fishers, Indiana'],
 ['Choose Joy Light Strand','10068 Bent Tree Lane, Fishers, Indiana'],
 ['Beaver Ridge Dr Lights','10540 Beaver Ridge Dr, Fishers, Indiana']
];
export function findCatalog(url){
 let pathname,hostname;try{const u=new URL(url);hostname=u.hostname.toLowerCase().replace(/^www\./,'');pathname=u.pathname.replace(/\/$/,'').toLowerCase();}catch{return null;}
 if(hostname!=='indywithkids.com')return null;
 if(['/decorated-halloween-houses','/halloween-houses-list-builder','/halloween-houses-indianapolis-central-indiana'].includes(pathname))return {name:'Indy with Kids · Halloween 2026',year:2026,season:'Halloween',url:'https://indywithkids.com/decorated-halloween-houses/',updated:'2026-10-21',records:irvington.map(([name,address])=>({name:`Irvington Halloween House · ${name}`,address:`${address}, Indianapolis, IN 46219`}))};
 if(pathname==='/christmas-lights-list-indianapolis-central-indiana')return {name:'Indy with Kids · Christmas 2025 archive',year:2025,season:'Christmas',url:'https://indywithkids.com/christmas-lights-list-indianapolis-central-indiana/',updated:'2025-12',records:christmas2025.map(([name,address])=>({name,address}))};
 return null;
}
/** Strip tags for imported public HTML. User must review extracted lines. Never execute embedded scripts. */
export function htmlToText(html){return String(html).replace(/<\s*(?:script|style|noscript|svg|iframe)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|noscript|svg|iframe)\s*>/gi,' ').replace(/<\s*br\b[^>]*\/?\s*>/gi,'\n').replace(/<\/?(?:p|div|li|h[1-6]|section|article|tr|dt|dd)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/[\t ]+/g,' ').replace(/\n[\t ]+/g,'\n').replace(/\n{3,}/g,'\n\n');}
