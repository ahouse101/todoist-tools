import * as request from 'request-promise-native';
import { Promise } from 'es6-promise';

let baseURL = 'https://beta.todoist.com/API/v8/';
let bearerToken = '168383ca84798d1a2e811be43c50dbe5454b245b';
let headers : object = {
	'Authorization': 'Bearer ' + bearerToken
}

enum ProjectCategory {
	Ignore, // Should not be changed.
	Task, // Tasks use sentence case and end with a period.
	Item // Items use sentence case, but DON'T end with a period.
}

// This function encapsulates the various API calls and processing needed to
// fix Todoist tasks.
export function fixTaskCasing() : void {
	let projects : any = {};
	let tasks : any[] = [];
	let contentUpdates : any = {};

	// Get projects from Todoist.
	console.log('Getting projects from Todoist...');
	let projectsRequest = request({
		url: baseURL + 'projects',
		headers: headers
	})
	.then((body) => {
		let shoppingPassed = false;
		for (const project of JSON.parse(body)) {
			// Add category to project.
			if (project.name === 'Inbox') project.category = ProjectCategory.Ignore;
			else if (shoppingPassed) project.category = ProjectCategory.Item;
			else if (project.name === 'Shopping') {
				project.category = ProjectCategory.Item;
				shoppingPassed = true;
			}
			else project.category = ProjectCategory.Task

			// Add project to dictionary.
			projects[project.id] = project;
		}
	});

	// Get tasks from Todoist.
	console.log('Getting tasks from Todoist...');
	let tasksRequest = request({
		url: baseURL + 'tasks',
		headers: headers
	})
	.then((body) => {
		tasks = JSON.parse(body);
	});

	// After data has been recieved, determine which tasks have incorrect casing.
	console.log('Performing case conversion...');
	Promise.all([projectsRequest, tasksRequest])
	.then(() => {
		for (const task of tasks) {
			switch (projects[task.project_id].category) {
				case ProjectCategory.Ignore:
					// If it has the Alexa label and is in the Inbox, it's a Task, not Ignore.
					let alexaLabelID = 2149625294; // TODO: Add API call to get this ID.
					if (task.hasOwnProperty("label_ids")) {
						for (const labelID of task["label_ids"]) {
							if (labelID === alexaLabelID) {
								fixCasing(task, true);
								// TODO: These tasks should also be moved to the Tasks project.
								break;
							}
						}
					}
					break;
				case ProjectCategory.Task:
					fixCasing(task, true);
					break;
				case ProjectCategory.Item:
					fixCasing(task);
					break;
				default:
					throw new Error('Invalid category.');
			}
		}
		return contentUpdates;
	})
	// Dispatch update requests for tasks that were fixed. 
	.then((contentUpdates) => {
		let requests = [];
		for (const taskID in contentUpdates) {
			if (contentUpdates.hasOwnProperty(taskID)) {
				console.log('Fixing "' + contentUpdates[taskID] + '"');
				requests.push(request({
					url: baseURL + 'tasks/' + taskID,
					method: 'POST',
					headers: headers,
					body: {
						content: contentUpdates[taskID]
					},
					json: true
				}));
			}
		}
		return Promise.all(requests);
	})
	.then(() => {
		console.log('All requests sent, script complete.');
	})
	.catch((err) => {
		console.log('Error occured, logged below.');
		console.log(err);
	});

	function fixCasing(task : any, addPeriod = false) : string {
		let content : string = task.content;
		if (content.length > 0) {
			// Format content.
			content = content[0].toUpperCase() + content.substr(1);
			if (content.slice(-1) !== ':') { // Ending in a colon denotes a collapsible heading (can't be checked off).
				if (addPeriod) {
					// Add a period if it doesn't have one.
					if (content.slice(-1) !== '.' && content.slice(-2) !== '."') content += '.';
				}
				else {
					// Remove the period in this case.
					if (content.slice(-1) === '.') content = content.slice(0, -1);
				}
			}

			// Add to updates object if changed.
			if (content !== task.content) contentUpdates[task.id] = content;
		}
		return content;
	}
}