let advancedOwner,advancedBusy=false;
const advancedCurrent=()=>advancedOwner===Api.getUser()?._id;
async function advancedAction(work,button){if(advancedBusy||!advancedCurrent())return false;advancedBusy=true;if(button)button.disabled=true;managementAlert('Working…','info');try{await work();return advancedCurrent();}catch(error){if(advancedCurrent())managementAlert(error.message,'error');return false;}finally{advancedBusy=false;if(button&&advancedCurrent())button.disabled=false;}}
function advancedButton(label,action,id){return `<button class="btn btn-outline btn-sm" type="button" data-action="${escapeHtml(action)}" data-resource="${escapeHtml(id)}">${escapeHtml(label)}</button>`;}
