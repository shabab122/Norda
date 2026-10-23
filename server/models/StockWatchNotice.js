const mongoose = require("mongoose");
const schema = new mongoose.Schema({watch:{type:mongoose.Schema.Types.ObjectId,ref:"StockWatch",required:true},generation:{type:Number,required:true},user:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},product:mongoose.Schema.Types.ObjectId,variantKey:String,status:{type:String,enum:["queued","sending","sent","local","failed","cancelled"],default:"queued"},attempts:{type:Number,default:0},nextAttemptAt:{type:Date,default:Date.now},claimedAt:Date,sentAt:Date,transport:String,lastError:String,messageId:String,unsubscribeToken:{type:String,select:false}},{timestamps:true});
schema.index({watch:1,generation:1},{unique:true});
module.exports = mongoose.model("StockWatchNotice",schema);
