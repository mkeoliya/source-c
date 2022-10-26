export const contPrelude = `
function loop(f) {
   let step = false;

    call_cc(brake => { 
        call_cc(kontinue => {
            f(brake, kontinue);
        });
        step = true;
    });

    return step ? loop(f) : null; 
}

function try_no_c(body) {
    call_cc(resume => {
        const exception = call_cc(thrw => {
            const res = body(thrw);
            resume(res);
        });
        
        resume(exception);
    });
}

function tryc(body, ctch) {
    call_cc(resume => {
        const exception = call_cc(thrw => {
            const res = body(thrw);
            resume(res);
        });
        
        resume(ctch(exception));
    });
}

function logic(body) {
    let fail_stack = null;
    
    function fail() {
        if (!is_pair(fail_stack)) {
            shift(k => false);
        } else {
            let back_track_point = head(fail_stack);
            fail_stack = tail(fail_stack);
            back_track_point(back_track_point);
        }
    }

    function amb(choices) {
        let cc = call_cc(k => k);
        if (is_null(choices)) {
            fail();
        } else {
            let choice = head(choices);
            choices = tail(choices);
            fail_stack = pair(cc, fail_stack);
            return choice;
        }
    }
    
    function assert(condition) {
        return condition() ? true : fail();
    }
    
    return reset(() => body(amb, assert));
}

function threads(body) {
    let thread_queue = null;
    let halt = null;


    function spawn(proc) {
        let cc = call_cc(k => k);
        if (is_cont(cc)) {
            thread_queue = append(thread_queue, list(cc));
        } else {
            proc();
            quit();
        }
    }

    function yld() {
        let cc = call_cc(k => k);
        if (is_cont(cc) && !is_null(thread_queue)) {
            let next_thread = head(thread_queue);
            thread_queue = append(tail(thread_queue), list(cc));
            next_thread(null);
        } 
    }

    function quit() {
        if(!is_null(thread_queue)) {
            let next_thread = head(thread_queue);
            thread_queue = tail(thread_queue);
            next_thread(null);
        } else {
            halt();
        }
    }

    function start_threads() {
        let cc = call_cc(k => k);
        if (is_cont(cc)) {
            halt = () => cc(false);
            if(!is_null(thread_queue)) {
                let next_thread = head(thread_queue);
                thread_queue = tail(thread_queue);
                next_thread(null);
            }
        }
    }
    
    return body(spawn, start_threads, yld);
}

function make_generator(data, walk) {
    let cc = null;
    
    function yld(val) {
        shift(k => {
            cc = k;
            return val;
        });
    }
    
    function it() {
        return reset(() => !is_cont(cc) ? walk(yld, data) : cc(null));
    }
    
    return it;
}
`
