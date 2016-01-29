'use strict';

const Promise = require('bluebird');
const Git = require('nodegit');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const isInitialCommit = id => id === '4ce864afb1d319e8bc7fb7c7f47c39208801b2a4';
const startDate = new Date(1443657600 * 1000);  // Oct 1st 2015
let isDirectory = path => {
  try {
    // Query the entry
    let stats = fs.lstatSync(path);

    // Is it a directory?
    if (stats.isDirectory()) {
      return true;
    }
    return false;
  } catch (e) {
    console.log(e);
    return false;
  }
};
const thru = f => x => { f(x); return x; };

const repoPath = path.resolve(__dirname, './repo');

const dateCrashFixed = [];
const processCommit = commit => {
  // console.log('At ' + commit.date().toString() + ' : ' + commit.sha() + ' => ' + commit.summary());
  const nullEntry = { getTree: () => ({ entryCount: () => 0  })  };
  const sum = arr => arr.reduce((acc, v) => acc + v, 0);

  let countFiles = folders => Promise.map(folders, type =>
    commit.getEntry(type)
    .catch(err => nullEntry)
    .then(entry => entry.getTree())
    .then(tree => tree.entryCount()))
  .then(v => sum(v));

  return countFiles(['crashes-fuzzing', 'crashes-memory-corruption', 'crashes'])
  .then(numCrash => countFiles(['fixed'])
    .then(numFixed => dateCrashFixed.push([commit.date(), numCrash, numFixed])))
  .catch(err => console.log(err));
};

let getRepo;
if (isDirectory(repoPath)) {
  // Update it
  getRepo = () => Git.Repository.open(repoPath)
  .then(repo => {
    console.log('Update repository');
    return repo.fetchAll({
      callbacks: {
        certificateCheck: function() {
          return 1;
        }
      }
    })
    .then(() => repo);
  })
  // Now that we're finished fetching, go ahead and merge our local branch
  // with the new one
  .then(thru(repo => repo.mergeBranches("master", "origin/master")))
} else {
  getRepo = () => Git.Clone('https://github.com/practicalswift/swift-compiler-crashes', repoPath);
}

const countOperations = [];
getRepo()
.then(thru(() => console.log('Cloned repo')))
.then(repo => repo.getMasterCommit())
.then(thru(() => console.log('Retrieved master commit')))
.then(commit => commit.history(Git.Revwalk.SORT.Time))
.then(thru(emitter =>
  emitter.on('commit', commit => {
    countOperations.push(processCommit(commit));
    if (isInitialCommit(commit.sha())) {
      emitter.emit('end');  // we're done
    }
  })
))
.then(emitter => new Promise((resolve, reject) => {
  emitter.on('end', () => {
    emitter.removeAllListeners();
    resolve();
  });
  emitter.on('error', reject);
  emitter.start();
}))
.then(() => console.log('Waiting for count'))
.then(() => Promise.all(countOperations))
.then(() => {
  dateCrashFixed.sort((a, b) => a[0] - b[0]);
  console.log('Date, Crashes, Fixed');
  dateCrashFixed
  .filter(x => x[0] > startDate)
  .forEach(x => console.log(`${ moment(x[0]).format() }, ${x[1]}, ${x[2]},`));
})
.catch(err => console.log(err));

