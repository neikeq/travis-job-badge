Travis Job Badges
========

Request badges for specific travis build jobs.

Uses http://shields.io to generate badges.

## Usage

##### Redirect to an specific job in the last build:

```
https://url/{owner}/{repository}/{job}
```

##### Get badge for an specific job in the last build:

```
https://url/{owner}/{repository}/{job}/badge
```

You can optionally specify a `subject` query parameter for the badge subject. Otherwise, it defaults to _"build"_.

##### Using both together in Markdown:

``` Markdown
[![Badge](https://url/{owner}/{repository}/{job}/badge)](https://url/{owner}/{repository}/{job})
```
