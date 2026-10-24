const mongoose = require("mongoose");
const schema = new mongoose.Schema({itemCase:{type:mongoose.Schema.Types.ObjectId,ref:"ItemReturnCase",required:true,index:true},order:{type:mongoose.Schema.Types.ObjectId,ref:"Order",required:true},requestKey:{type:String,required:true},intentHash:String,items:[new mongoose.Schema({lineIndex:Number,quantity:Number,restockQuantity:Number,warehouse:String},{_id:false})],note:String,actor:mongoose.Schema.Types.ObjectId},{timestamps:true});
schema.index({itemCase:1,requestKey:1},{unique:true});
module.exports = mongoose.model("ReturnReceipt",schema);
