// Filters the blog listing by tag, in place.
//
// The tag is kept in the address (/blog/?tag=recipe), so a filtered list can
// be linked to, and the tag links on a post lead straight to one. Without JS
// every link still opens the listing; it just shows all the posts.

(function () {
  var items = Array.prototype.slice.call(document.querySelectorAll('.post-list li[data-tags]'));
  if (!items.length) return;

  var years = Array.prototype.slice.call(document.querySelectorAll('.post-year'));
  var row = document.querySelector('.tag-row');
  var rowLinks = row ? Array.prototype.slice.call(row.querySelectorAll('a[data-tag]')) : [];

  // Shown when a tag in the address matches nothing, such as a mistyped one.
  var none = document.createElement('p');
  none.className = 'post-empty';
  none.textContent = 'No posts with that tag.';
  none.hidden = true;
  years[years.length - 1].insertAdjacentElement('afterend', none);

  function apply(tag) {
    var shown = 0;
    items.forEach(function (li) {
      var has = !tag || li.getAttribute('data-tags').split(' ').indexOf(tag) >= 0;
      li.hidden = !has;
      if (has) shown++;
    });
    // A year with nothing left in it loses its heading too.
    years.forEach(function (y) {
      y.hidden = !y.querySelector('li[data-tags]:not([hidden])');
    });
    none.hidden = shown > 0;

    rowLinks.forEach(function (a) {
      if (a.getAttribute('data-tag') === tag) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  function current() {
    return new URLSearchParams(location.search).get('tag') || '';
  }

  // The chips in the row above the list.
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[data-tag]') : null;
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    var tag = a.getAttribute('data-tag');
    history.pushState(null, '', tag ? '?tag=' + encodeURIComponent(tag) : location.pathname);
    apply(tag);
  });

  window.addEventListener('popstate', function () {
    apply(current());
  });

  apply(current());
})();
