'use strict';

const Git = require('nodegit');
const path = require('path');
const fs = require('fs');
const isInitialCommit = id => id === '4ce864afb1d319e8bc7fb7c7f47c39208801b2a4';
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

getRepo()
.then(thru(() => console.log('Cloned repo')))
.then(repo => repo.getMasterCommit())
.then(thru(() => console.log('Retrieved master commit')))
.then(commit => commit.history())
.then(thru(emitter =>
  emitter.on('commit', commit => {
    console.log('At ' + commit.date().toString() + ' : ' + commit.sha() + ' => ' + commit.summary());
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
.then(() => console.log('Done'))
.catch(err => console.log(err));

