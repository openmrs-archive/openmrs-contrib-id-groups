$().ready(function(){
	// keep tabs on the provisioning-api status (every 5sec)
	setInterval(function(){
		$.ajax('/admin/groups/provisioning', {
			timeout: 5000,
			success: function(data){
				$('#provisioning-status').hide().html(data); // parse new HTML and hide status (while processing)
				// remove everything except what we know is the status
				var keep = $('#provisioning-status').children('#provisioning-status-xhr');
				$('#provisioning-status').html(keep).show(); // replace with ONLY the status, and make visible
			}
		});
	}, 5000);
});