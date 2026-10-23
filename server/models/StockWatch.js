const mongoose = require("mongoose");
const schema = new mongoose.Schema({user:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},product:{type:mongoose.Schema.Types.ObjectId,ref:"Product",required:true},variantKey:{type:String,required:true,default:"base"},active:{type:Boolean,default:true},generation:{type:Number,default:1},unsubscribeHash:{type:String,select:false},fulfilledAt:Date},{timestamps:true});
schema.index({user:1,product:1,variantKey:1},{unique:true});
module.exports = mongoose.model("StockWatch",schema);
