var express = require('express');
var mkdirp = require('mkdirp');
var request = require('request');
var cachedRequest = require('cached-request')(request);
var NodeCache = require('node-cache');

var buildsCache = new NodeCache();

var badgesDirectory = 'tmp/badges';
mkdirp(badgesDirectory, function(err) {
  if (err) {
    console.error(err);
  }
});
cachedRequest.setCacheDirectory(badgesDirectory);

var app = express();

app.set('port', (process.env.PORT || 5000));

app.use(function noCache(req, res, next) {
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  var date = new Date().toGMTString();
  res.header('Expires', date);
  res.header('Date', date);
  res.header('Pragma', 'no-cache');

  next();
});

app.use(express.static(__dirname + '/public'));

app.get('/:username/:repository/:job', function(req, res) {
  var repo = req.params.username + '/' + req.params.repository;

  var options = {
    url: 'https://api.travis-ci.org/repos/' + repo + '.json',
    headers: {
      'Accept': 'application/vnd.travis-ci.2+json'
    }
  };

  request(options, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      var repoData = JSON.parse(body);
      var repoId = repoData.id;
      var buildId = repoData.last_build_id;
      var lastBuild = repoData.last_build_started_at;

      if (buildId) {
        getBuildJobState(repoId, buildId, lastBuild, req.params.job, function(job) {
          if (job) {
            res.redirect(301, 'https://travis-ci.org/' + repo + '/jobs/' + job.id);
          }
          else {
            res.status(404);
            res.send('Job not found.');
          }
        });

        return;
      }
    }

    res.status(400);
    res.send('Branch build id not found.');
  });
});

app.get('/:username/:repository/:job/badge', function(req, res) {
  var repo = req.params.username + '/' + req.params.repository;

  var options = {
    url: 'https://api.travis-ci.org/repos/' + repo + '.json',
    headers: {
      'Accept': 'application/vnd.travis-ci.2+json'
    }
  };

  request(options, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      var repoData = JSON.parse(body);
      var repoId = repoData.id;
      var buildId = repoData.last_build_id;
      var lastBuild = repoData.last_build_started_at;

      if (buildId) {
        getBuildJobState(repoId, buildId, lastBuild, req.params.job, function(job) {
          if (job) {
            sendResponse(job, req.query.subject, res);
          }
          else {
            res.status(404);
            res.send('Job not found.');
          }
        });
      }
      else {
        sendResponse({
          id: -1,
          state: 'unknown'
        }, req.query.subject, res);
      }
    }
    else {
      res.status(400);
      res.send('Branch build id not found.');
    }
  });
});

app.listen(app.get('port'), function() {
  console.log('Node app is running at localhost:' + app.get('port'));
});

function getBuildJobState(repoId, buildId, repoLastBuild, jobNumber, callback) {
  try {
    var repoCache = buildsCache.get(buildId, true);

    if (repoCache.last_build != repoLastBuild) {
      throw 'Outdated build cache.';
    }

    callback(repoCache.jobs[jobNumber]);
  } catch (err) {
    getTravisBuildJobState(repoId, buildId, repoLastBuild, jobNumber, callback);
  }
}

function getTravisBuildJobState(repoId, buildId, repoLastBuild, jobNumber, callback) {
  var options = {
    url: 'https://api.travis-ci.org/builds/' + buildId,
    headers: {
      'Accept': 'application/vnd.travis-ci.2+json'
    }
  };

  request(options, function(error, response, body) {
    if (!error && response.statusCode == 200) {
      var buildData = JSON.parse(body);
      var buildNumber = buildData.build.number;

      var jobs = {};

      buildData.jobs.forEach(function(job) {
        jobs[Math.round((job.number - buildNumber) * 10)] = {
          id: job.id,
          state: job.state
        };
      });

      if (!isEmpty(jobs)) {
        saveBuildCache(repoId, buildId, jobs, repoLastBuild);
      }

      callback(jobs[jobNumber]);
    }
  });
}

function saveBuildCache(repoId, buildId, jobs, repoLastBuild) {
  for (var build in buildsCache.keys()) {
    if (build.repo_id == repoId) {
      buildsCache.del(build);
    }
  }

  var buildInfo = {
    repo_id: repoId,
    last_build: repoLastBuild,
    jobs: jobs
  };

  buildsCache.set(buildId, buildInfo, function(err, success) {
    if (!success) {
      console.log('Error caching the build information:');
      console.log(err ? err.message : 'No information');
    }
  });
}

function sendResponse(job, subject, res) {
  var badgeName = (subject ? subject : 'job') + '-' + stateToBadge(job.state);
  
  var req = cachedRequest({
    url: 'https://img.shields.io/badge/' + badgeName + '.svg'
  });
  
  req.on('response', function (resp) {
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    var date = new Date().toGMTString();
    resp.headers['Expires'] = date;
    resp.headers['Date'] = date;
    resp.headers['Pragma'] = 'no-cache';
  });
  
  res.header('Content-Type', 'image/svg+xml;charset=utf-8');
  req.pipe(res);
}

function stateToBadge(state) {
  switch (state) {
    case 'passed':
      return 'passing-brightgreen';
    case 'failed':
      return 'failing-red';
    case 'received':
    case 'created':
    case 'started':
      return 'building-yellow';
    default:
      return 'unknown-lightgrey';
  }
}

function isEmpty(obj) {
  for (var name in obj) {
    if (obj.hasOwnProperty(name)) {
      return false;
    }
  }
  return true;
}
