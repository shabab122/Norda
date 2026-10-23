const crypto=require("node:crypto"), error=require("./httpError");
function minor(value,negative=false){if(!["string","number"].includes(typeof value)||!(negative?/^-?\d+(\.\d{1,2})?$/:/^\d+(\.\d{1,2})?$/).test(String(value)))throw error(400,"Use an amount with at most two decimal places");const n=Math.round(Number(value)*100);if(!Number.isSafeInteger(n)||Math.abs(n)>1e12)throw error(400,"Amount exceeds the supported range");return n;}
const hash=v=>crypto.createHash("sha256").update(typeof v==="string"?v:JSON.stringify(v)).digest("hex");
const plain=v=>v?.toObject?v.toObject():{...v};
const text=(v,max=120)=>{if(typeof v!=="string"||!v.trim()||v.trim().length>max||/[\u0000-\u001f]/.test(v))throw error(400,"Provide valid text within the allowed length");return v.trim();};
module.exports={minor,hash,plain,text};
