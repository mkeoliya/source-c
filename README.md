# SourceC

Running SourceC in a local Source Academy
===========================================

1. Clone the SourceC language (this repo).

1. Build and link the SourceC language:
    ``` {.}
    $ cd cs4215-project-2022-figueres
    $ yarn
    $ yarn build
    $ yarn link
    ```

1. Clone the Source Academy for Source C at https://github.com/nus-cs4215/cs4215-project-2022-frontend-figueres:

1. Build Source Academy:
    ``` {.}
    $ cd cs4215-project-2022-frontend-figueres
    $ yarn
    $ yarn link "x-slang"
    ```
    
1. Start Source Academy:
    ``` {.}
    $ cd cs4215-project-2022-frontend-figueres
    $ yarn start
    ```
    
  Open `http://localhost:8000` in your browser to see your local Source Academy.

Running SourceC outside of Source Academy
===========================================

To add \"x-slang\" (SourceC) to your PATH, build it as per the above
instructions (steps 1-2 in the previous section), then run

``` {.}
$ cd dist
$ npm link
```

If you do not wish to add \"x-slang\" to your PATH, replace
\"x-slang\" with \"node dist/repl/repl.js\" in the following examples.

To try out *Source* in a REPL, run

``` {.}
$ x-slang '1 * 1'
```

Hint: In `bash` you can take the `PROGRAM_STRING` out
of a file as follows:

``` {.}
$ x-slang "$(< my_source_program.js)"
```

Tests
======

Tests can be run by entering `yarn test` into the console. View the console output for the list of failed tests.

Examples of control flow blocks using call/cc 
======

``` js
// Loops
const EVIL_VALUE = 3;

let i = 0;
loop((brk, kontinue) => {
    if (i >= 5) { brk(null); }
    
    i = i + 1;
    
    if (i === EVIL_VALUE) {
        kontinue(null);
    }
    
    // do some work
    display(i);
});
```

``` js
// Try/Catch
const safe_head = (p, thrw) => is_pair(p) ? head(p) : thrw('not a pair!');

// not a pair!
let not_a_pair = 5; 
const on_catch = err => err;

const res = tryc(thrw => {
    const h = safe_head(not_a_pair, thrw);
    display(h);
    
}, on_catch);

res;
```

``` js
// Generators
const normal_walk = (yld, lst) => {
    if(is_null(lst)) {
        yld(null);
    } else {
        yld(head(lst));
        normal_walk(yld, tail(lst));
    }
};

const skip_walk = (yld, lst) => {
    if(is_null(lst)) {
        yld(null);
    } else {
        if (is_null(tail(lst))) {
            yld(head(lst));
        } else {
            yld(head(lst));
            skip_walk(yld, tail(tail(lst)));
        }
    }
};

const it = make_generator(list(1,2,3,4,5), skip_walk);
loop((brk, _) => {
    const v = it();
    
    if(is_null(v)) {
        brk(null);
    } 
    
    display(v);
});
```

``` js
// Threads

function make_routine(yld, name) {
    return () => {
        display("hello from " + name);
        yld();
        display(name + " says hi again");
    };
}


threads((spawn, start_threads, yld) => {
    spawn(make_routine(yld, "bob"));
    spawn(make_routine(yld, "alice"));
    
    start_threads();
    
});
```

``` js
// Logical
let a = null;
let b = null;

const res = logic((amb, assert) => {
    a = amb(list(10, 20, 30, 40));
    b = amb(list(1,2,3,4,5));

    assert(() => a + b === 42);

});

display(res);
display(a, "a: ");
display(b, "b: ");
```
