---
# A recipe post. To use: copy this file to _posts/YYYY-MM-DD-short-name.md
# (the date and name become the address, /blog/short-name/), fill it in,
# and commit. Nothing in _templates/ is published.
#
# Quote a title or a line that contains a colon or starts with a symbol.
title: "Name of the dish"

# One line, shown under the title in the list of posts.
description: One line about it.

# One tag, two at most, from the list in _config.yml:
#   food, recipe, life, random, 3d, game dev, tech
tags: [recipe]

# The recipe card at the end of the post. Every line in it is optional;
# use `makes: 12 dumplings` in place of `serves` if that fits better.
recipe:
  serves: 2
  time: 30 min
  ingredients:
    - 200 g of something
    - 2 of something else
    - A pinch of salt
  steps:
    - The first thing to do.
    - The next thing.
    - Serve.
  notes: Swaps, what goes wrong, what to do with leftovers.
---

Write the post here, like any other: where the dish comes from, why you make
it, what you changed. Photos go here too.

The recipe itself is the `recipe:` block above. It is shown as a card at the
end of the post, and a "Jump to recipe" link is added under the title.
