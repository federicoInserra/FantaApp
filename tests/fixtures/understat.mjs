export const now=new Date('2026-10-07T12:00:00Z');
export function rawLeague() { return {
  players:[{id:'1',player_name:'Sample Player',team_title:'Inter',games:'2',time:'180',xG:'1.3',npxG:'0.9',xA:'0.4',shots:'4'}],
  teams:{1:{id:'1',title:'Inter',history:[{date:'2026-09-01 18:45:00',h_a:'h',xG:2,xGA:0.5},{date:'2026-09-08 18:45:00',h_a:'a',xG:1,xGA:1.5}]},2:{id:'2',title:'AC Milan',history:[{date:'2026-09-01 18:45:00',h_a:'a',xG:0.5,xGA:2},{date:'2026-09-08 18:45:00',h_a:'h',xG:1.5,xGA:1}]}},
  dates:[{id:'100',h:{id:'1'},a:{id:'2'},isResult:true,datetime:'2026-09-01 18:45:00'},{id:'101',h:{id:'2'},a:{id:'1'},isResult:false,datetime:'2026-10-10 18:45:00'}]
}; }
