$().ready(function(){
	// keep tabs on the provisioning-api status (every 5sec)
	setInterval(function(){
		$.ajax('/admin/groups/provisioning', {
			timeout: 5000,
			success: function(data){
				// update the status
				$('#provisioning-status').html(data);
			}
		});
	}, 5000);
});