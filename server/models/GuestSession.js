const mongoose = require("mongoose");
const schema = new mongoose.Schema({user:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true}, tokenHash:{type:String,required:true,unique:true,select:false}, expiresAt:{type:Date,required:true}, claimedBy:mongoose.Schema.Types.ObjectId},{timestamps:true});
schema.index({expiresAt:1},{expireAfterSeconds:0});
module.exports = mongoose.model("GuestSession",schema);
