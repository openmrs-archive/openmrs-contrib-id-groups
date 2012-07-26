$().ready(function(){
	/* MAILING LISTS */
	// label un/checks checkboxes in subscribe popover
	$('.group-list .popover li label').click(function(){
		var checkbox = $(this).siblings('input[type=checkbox]');
		if (checkbox) {
			if (checkbox.filter(':checked').length > 0)	checkbox.removeAttr('checked');	
			else checkbox.attr('checked', 'checked');	
		}
	});
	// AJAX for subscribtion-update forms
	$('.group-list li [type=submit]').click(function(event){
		event.preventDefault();
		var button = $(this),
			icon = button.find('i[class*="icon-"]'),
			form = $(this).parents('form'),
			submitUrl = form.attr('action');
		
		// show status in popover or beside button	
		var showStatus = function(message, failed){
			var status = button.siblings('span.status');
			status.html('');
			setTimeout(function(){
				status.html(message);
				if (failed) status.addClass('failtext');
			}, 50);
		};
		
		// make the ajax call
		$.ajax({
			url: submitUrl,
			type: 'POST',
			data: form.serialize(),
			dataType: 'json',
			beforeSend: function(){
				button.addClass('active');
				form.addClass('working');
				showStatus('Working...');
			},
			error: function(jqXHR, textStatus, errorThrown){
				button.removeClass('active');
				form.removeClass('working');
				showStatus('Error! ('+textStatus+' / '+errorThrown+')', true);
			},
			success: function(subs) {
				button.removeClass('active');
				form.removeClass('working');
				showStatus('Updated.');
				
				// change UI text/icons to reflect change
				var input = form.find('input[name="address"]');
				if (input.length == 1) { // no secondary emails
					icon.removeClass();
					if (subs.indexOf(input.attr('value')) > -1) {
						button.find('i').addClass('icon-envelope');
						button.find('span').html('Unsubscribe');
					}
					else {
						button.find('i').addClass('icon-envelope-alt');
						button.find('span').html('Subscribe');
					}
				}
				
				// check / enable email addresses that are now subscribed (sanity)
				form.find('input[name="address"]').each(function(i, elem){
					elem = $(elem);
					var address = elem.attr('value');
					if (subs.indexOf(address) > -1) { // now subscribed
						if (elem.attr('type') == 'checkbox') {elem.attr('checked', 'checked');}
						if (elem.attr('type') == 'hidden') {elem.attr('disabled', 'disabled');}
					}
					else { // now unsubscribed
						if (elem.attr('type') == 'checkbox') {elem.removeAttr('checked');}
						if (elem.attr('type') == 'hidden') {elem.removeAttr('disabled');}
					}
				});
				
				setTimeout(function(){
					if (button.parents('.popover')) button.parents('.popover').removeClass('visible');
					showStatus('');
				}, 2000);
			}
		});
		
	});
	
});