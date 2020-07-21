# TODO

Principles:

1. DRY
2. There's only one way to do it
3. DOM Rules All: No hidden information, components are "spicier" DOM elems
4. No invented syntax
5. Deterministic template rendering
6. Template language is weak, JavaScript is strong
7. Silo'ed components

No hidden info: How can I make it so that EVERYTHING is visible on the DOM? NO
hidden information outside of whats attached as attributes. E.g.

    <div onclick="getPosts" args_username="{{ username }}">
      Get posts!
    </div>

    <script>
      function getPosts(elem) {
        fetch('/posts/' + elem.props.args_username) /* etc */
      }
    </script>

    OR, with a template helper sugar:

    <div onclick="getPosts" {% args username %}></div>

    OR, further:
    <div {% attach "onclick" username %}></div>

Silo'ed components: How can I ensure the "customizability" is sole'd in each
component? E.g. if a component brings in its own state machine, that's okay.
Explicit uses: uses="a-b-c" namespace-comp-name --- first dash can be omitted?


## Concepts

- $ -> means silo'ed to this particular component
  - e.g. $ { }  (CSS just for this component)
  - state="$" - private state for this component based on key-tree

# TODO

### What's left:

- Debug content issues (see `composition_test.html`)

- Clean up code, create simple build pipeline

- Give new branding / name (Modulus.js maybe?)


### Server-side rendering notes

- First see if there are good standards to use for these modes
- Have 2 modes:
    - stdin/stdout mode
        - simple DSL that uses pipes
    - server mode
        - simple HTTP server

- Python implementation:
    - function that takes HTML document string, and then SSR's all references
      to components
    - In-memory LRU cache based on normalized component form (see below)
    - Everything else delegate to above
    - stdin/stdout mode:
        - Start subprocess with python process

- Django implementation:
    - Django caching framework in addition to or instead of LRU

- Normalizing form is easy:

    <x-Button type="Whatever" name="thing">Click me</x-Button>

- Becomes:

    <x-Button name="thing" type="Whatever" children="Click me"></x-Button>






