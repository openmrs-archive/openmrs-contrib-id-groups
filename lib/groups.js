var path = require('path'),
  express = require('express'),
	Common = require(global.__apppath+'/openmrsid-common'),
	log = Common.logger.add('groups'),
	db = Common.db,
	conf = Common.conf,
	app = Common.app,
	mid = Common.mid,
	nav = Common.userNav,
	admin = Common.module.admin;


/*
DATABASE MODEL
==============
*/

db.define('Groups', { // mirrors output of ga-provisioning
	id: {type: db.INTEGER, primaryKey: true, autoIncrement: true},
	address: {type: db.STRING, unique: true},
	name: db.STRING,
	urlName: db.STRING,
	emailPermission: db.STRING,
	permissionPreset: db.STRING,
	description: db.STRING,
	visible: {type: db.BOOLEAN, defaultValue: false}
});

db.define('Subscriptions', {
	id: {type: db.INTEGER, primaryKey: true, autoIncrement: true},
	user: {type: db.STRING, allowNull: false, unique: true},
	subscriptions: {type: db.TEXT},
}, {
	instanceMethods: {
		onSave: function(instance){
			// JSON subscriptions object to string for storing as text
			if (typeof instance.subscriptions == 'object') {
				log.trace('converting subscriptions data from JSON to string');
				instance.subscriptions = JSON.stringify(instance.subscriptions);
			}
		},
		onGet: function(instance){
			// JSON text string to subscriptions object
			if (typeof instance.subscriptions == 'string') {
				log.trace('converting subscriptions data from string to JSON');
				instance.subscriptions = JSON.parse(instance.subscriptions);
			}
		}
	}
});

db.define('GroupsConf', {
	id: {type: db.INTEGER, primaryKey: true, autoIncrement: true},
	key: {type: db.STRING, unique: true},
	value: {type: db.TEXT}
});

// Load module components now that DB structure is defined
var	ga = require('./ga-provisioning'),
	sync = require('./sync');


/*
USER-NAV
========
*/
nav.add({
	"name": "Mailing Lists",
	"url": "/mailinglists",
	"viewName": "mailinglists",
	"visibleLoggedOut": false,
	"visibleLoggedIn": true,
	"requiredGroup": "dashboard-users",
	"icon": "icon-envelope-alt",
	"order": 50
});

/*
ADMIN PAGE
==========
*/
admin.addModulePage('Google Groups', '/admin/groups');


/*
ROUTES
======
*/
app.get('/mailinglists', mid.forceLogin, function(req, res, next) {
	var user = req.session.user;

	// initiate variables
	var subscriptions = {};

	// get all groups
	db.getAll('Groups', function(err, groups){
		if (err) return next(err);

		// load groups into subscription array
		groups.forEach(function(group, idx){
			subscriptions[group.address] = [];
		});


		var errored = false; // keeps next(err) from being called multiple times, which is _bad_
		user.emailList.forEach(function(email){
			ga.getGroupsByEmail(email, function(err, subbedGroups){
				if (err) {
					if (!errored) {
						next(err);
						errored = true;
					}
					return;
				}

				// build subscriptions table
				subbedGroups.forEach(function(group){
					subscriptions[group.address].push(email);
				});

				finishLoading();
			});
		});

		var callbacks = 0;
		var finishLoading = function() {
			callbacks++;
			if (callbacks == user.emailList.length) { // every address has called back

				// RENDER THE PAGE
				res.render(__dirname+'/../views/mailinglists', {
					groups: groups,
					subs: subscriptions,
					emails: user.emailList
				});
				log.trace('mailinglists rendered, now storing subscriptions in DB');

				// store subscriptions for user in DB (occurs after page has loaded)
				db.findOrCreate('Subscriptions', {user: req.session.user.username}, function(err, instance){
					if (err) return log.error("Error saving user subscriptions to DB:\n"+JSON.stringify(err));

					// update with current subscriptions & push to DB
					instance.subscriptions = subscriptions;
					log.trace('pushing updated subscription instance to DB');
					db.update(instance, function(err) {
						if (err) return log.error("Error saving user subscriptions to DB:\n"+JSON.stringify(err));
						log.trace('DB update returned successfully');
					});
				});
			}
		}

	});
});

// allows direct linking to a list
app.get('/mailinglists/:group', function(req, res, next){
	res.redirect('/mailinglists#'+req.params.group);
});

app.post('/mailinglists/:group', mid.forceLogin, function(req, res, next) { // both sub and unsub's get posted here
	// detect whether this is in AJAX call
	var ajax = (req.header('X-Requested-With') == 'XMLHttpRequest') ? true : false;
	log.trace('incoming ajax request: '+ajax);

	var user = req.session.user,
		group = req.params.group;

	if (!req.body.address) req.body.address = []; // if empty, should be represented as a blank array
	var	updatedAddresses = (req.body.address.constructor == Array) ? req.body.address : [req.body.address];

	// get array of all a user's email addresses
	var userEmails = user.emailList;

	// get group with this url-name, to find its email address
	db.find('Groups', {urlName: group}, function(err, instance){
		if (err) return handleError(err);
		var groupEmail = instance[0].address;

		// get subscriptions from database, to determine changes made
		db.find('Subscriptions', {user: user.username}, function(err, instance){
			if (err) return handleError(err);
			if (!instance || instance.length == 0) return handleError(new Error('Unable to retrieve groups.'));
			var oldSubs = instance[0].subscriptions;

			var updatedSubs = {};
			updatedSubs[groupEmail] = updatedAddresses; // in the same format as oldSubs

			var actions = {}, errored = false;

			function handleError(err){ // response to AJAX properly, keeps from getting caught in an error-loop
				if (!errored) {
					errored = true;
					if (ajax) { // respond with JSON
						return res.send(err.message, 500);
					}
					else {
						return next(err);
					}
				}
			}

			var updateCallsNeeded = userEmails.length, updateCallsReturned = 0;
			function finishSubscriptionUpdate(){
				updateCallsReturned++;
				log.debug('subscription finished for an email address, '+updateCallsReturned+' of '+updateCallsNeeded);
				if (updateCallsReturned == updateCallsNeeded) { // done
					// create list of all user's subscriptions including those just updated
					var newSubList = oldSubs;
					for (list in updatedSubs) {oldSubs[list] = updatedSubs[list]};

					// push new subscriptions to DB
					instance[0].subscriptions = newSubList;
					db.update(instance[0], function(err) {
						log.trace('pushed new subscription list to DB');
						if (err) handleError(err);
					});

					// server is finished; send the response back
					if (ajax) { // send JSON response
						log.trace('sending ajax response');
						res.contentType('application/json');
						return res.send(updatedSubs[groupEmail], 200); // send JSON array of subscriptions to group
					}
					else {
						log.trace('sending redirect repsonse');
						req.flash('success', 'Subscriptions updated for '+group);
						return res.redirect('/mailinglists', 303);
					}
				}
			}

			// do the actual subscription - handle any contradiction between old and updated subs
			userEmails.forEach(function(email){
				if (oldSubs[groupEmail].indexOf(email) > -1 && updatedSubs[groupEmail].indexOf(email) == -1) {
					// remove email from group
					log.trace('removing '+email+' from '+group);
					ga.removeUser(email, group, function(err) {
						if (err) handleError(err);
						log.info(user.username+': '+email+' unsubscribed from '+group);
						finishSubscriptionUpdate();
					});
				}
				else if (oldSubs[groupEmail].indexOf(email) == -1 && updatedSubs[groupEmail].indexOf(email) > -1) {
					// add email to group
					log.trace('adding '+email+' to '+group);
					ga.addUser(email, group, function(err, result) {
						if (err) handleError(err);
						log.info(user.username+': '+email+' subscribed to '+group);
						finishSubscriptionUpdate();
					});
				}
				else finishSubscriptionUpdate(); // no change made
			});


		});
	});

});

app.get('/mailinglists/resource/*', function(req, res, next){
	var resourcePath = path.join(__dirname, '/../resource/', req.params[0]);
	res.sendfile(resourcePath);
});

app.use('/mailinglists/resource', express.static(path.join(__dirname, '/../resource/')));

// Administration Routes
app.get('/admin/groups', mid.restrictTo('dashboard-administrators'), admin.useSidebar, function(req, res, next) {
	db.getAll('Groups', function(err, instances){ // get group instances
		if (err) return next(err);

		db.find('GroupsConf', {key: ['username', 'password', 'domain']}, function(err, prefs){ // get authentication info
			if (err) return next(err);

			var user, pass, domain;
			prefs.forEach(function(pref){
				if (pref.key == 'username') user = pref.value;
				else if (pref.key == 'password') pass = pref.value;
				else if (pref.key == 'domain') domain = pref.value;
			});

			res.render(__dirname+'/../views/groups-admin', {
				groups: instances,
				apiStatus: ga.connectionStatus,
				username: user || undefined,
				password: pass || undefined,
				domain: domain || undefined
			});

		});
	});

});
app.get('/admin/groups/provisioning', mid.restrictTo('dashboard-administrators'), function(req, res, next){
	if (req.xhr) { // render provisioning-api status message
		res.render(__dirname+'/../views/provisioning-status', {
			_layoutFile: false,
			apiStatus: ga.connectionStatus
		});
	}
	else res.redirect('/admin/groups');
});
app.post('/admin/groups/provisioning', function(req, res, next){
	// create object of values from our form
	var auth = {
		username: req.body.gausername || null,
		password: req.body.gapassword || null,
		domain: req.body.gadomain || null
	};

	// find/create a value for each of the auth parameters & push to chain
	var chain = [];
	for (var a in auth) {
		log.debug('setting '+a+' of provisioning api');
		db.findOrCreate('GroupsConf', {key: a}, function(err, param){
			if (err) finish(err);

			if (param.key == 'username') param.value = auth.username;
			if (param.key == 'password') param.value = auth.password;
			if (param.key == 'domain') param.value = auth.domain;
			chain.push(param);
			finish();
		});
	}

	// called once all db params set
	var calls = 0, errored = false;
	var finish = function(err) {
		if (err && !errored) { // handle (only one) error
			errored = true;
			return next(err);
		}

		calls++;
		if (calls == 3) {
			// push chain to DB
			log.debug('saving provisioning api authentication to DB');
			db.chainSave(chain, function(err){
				if (err) return next(err);

				// re-auth & re-sync groups (in background)
				ga.connectionStatus = 0; // force Provisioning to re-authenticate
				sync.syncGroups(function(err){
					if (err) log.error(err);
				});

				// FINISH & REDIRECT
				res.redirect('/admin/groups', 303)
			});
		}
	}


});
app.post('/admin/groups/visibility', function(req, res, next){
	// build array of group urlNames for groups that were marked visible
	var nowVisible = req.body;

	// loop through each group, writing it visible or invisible
	db.getAll('Groups', function(err, grps){
		if (err) return next(err);

		var chain = [];
		grps.forEach(function(group){ // check if each group is visible
			if (nowVisible[group.urlName]) group.visible = true;
			else group.visible = false;

			chain.push(group); // add group to the update chain
		});

		// save the modified DB entries
		db.chainSave(chain, function(err){
			if (err) return next(err);

			req.flash('success', 'Group visibilities updated.');
			res.redirect('/admin/groups', 303);
		});


	});
});