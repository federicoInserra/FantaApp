export const players=[...Object.entries({P:2,D:6,C:6,A:4}).flatMap(([role,count])=>Array.from({length:count},(_,i)=>({id:`${role}${i}`,role,name:`${role} Giocatore ${i}`,club:'Inter',available:true,form:i,vote:6})))];
export const lineup={formation:'4-3-3',starters:['P0','D0','D1','D2','D3','C0','C1','C2','A0','A1','A2'],bench:['A3','C5','D5','P1']};
