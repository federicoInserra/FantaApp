export const voteListSource=value=>value==='fantamaster'?'fantamaster':'leghe';
export const voteProvider=value=>voteListSource(value)==='fantamaster'?'FantaMaster':'Redazione Fantacalcio';
