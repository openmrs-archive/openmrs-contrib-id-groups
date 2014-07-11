$().ready(function(){
	/* MAILING LISTS */

	// At page load, the .email-selector-submit's are contained within templates,
	// so jQuery can't access them director. So we watch for the bootstrap "shown
	// popover" event and bind the submit selector then.
	// $('.group-list').on('shown.bs.popover', function() {
	// 	bindEmailSelectorSubmit();
	// });

	// bindEmailSelectorSubmit();

	$('.view-subscriptions').each(function(button) {

		$(this).popover({
			html: true,
			placement: 'bottom',
			content: $(this).siblings('.email-selector').html(),
      trigger: 'focus' // closes popover when user clicks outside
		});

		// Update the popover stored content when it closes
		$(this).on('hide.bs.popover', function() {
			var content = $(this).siblings('.popover').find('.popover-content').html();
			$(this).prop('data-content', content);
		});
	});

	// AJAX for subscribtion-update forms
	function bindEmailSelectorSubmit() {
		$('.email-selector-submit').click(function(event){
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
						if ($.inArray(input.attr('value'), subs) > -1) {
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
						if ($.inArray(address, subs) > -1) { // now subscribed
							if (elem.attr('type') == 'checkbox') {elem.prop('checked', true);}
							if (elem.attr('type') == 'hidden') {elem.prop('disabled', true);}
						}
						else { // now unsubscribed
							if (elem.attr('type') == 'checkbox') {elem.prop('checked', false);}
							if (elem.attr('type') == 'hidden') {elem.prop('disabled', false);}
						}
					});

					setTimeout(function(){
						// if (button.parents('.popover')) button.parents('.popover').removeClass('visible');
						form.find('.view-subscriptions').popover('hide');
						showStatus('');
					}, 2000);
				}
			});
		});
	}


});