use dep::wraith_lib as w;
use dep::wraith_clmm_lib as clmm;

fn main() {}

#[test]
fn print_flow_values() {
    let sk: Field = 7;
    let owner = w::owner_key(sk);

    let mint_note = w::note_commitment(0, 1000000, owner, 111);
    let mint_nullifier = w::nullifier(mint_note, sk);
    let mint_root = w::compute_merkle_root(mint_note, [0; 20], [0; 20]);
    let mint_position = clmm::position_commitment(
        1, 1000, 2000, 100000,
        0, 0, 0, 0,
        owner, 1, 12345,
    );
    let mint_position_nullifier = clmm::position_nullifier(mint_position, sk);
    let collected_position = clmm::position_commitment(
        1, 1000, 2000, 100000,
        0, 0, 0, 0,
        owner, 2, 12346,
    );
    let collected_position_nullifier = clmm::position_nullifier(collected_position, sk);

    println(f"owner={owner}");
    println(f"mint_note={mint_note}");
    println(f"mint_root={mint_root}");
    println(f"mint_input_nullifier={mint_nullifier}");
    println(f"mint_position={mint_position}");
    println(f"mint_position_nullifier={mint_position_nullifier}");
    println(f"collected_position={collected_position}");
    println(f"collected_position_nullifier={collected_position_nullifier}");

    let swap_note = w::note_commitment(0, 100000, owner, 111);
    let swap_nullifier = w::nullifier(swap_note, sk);
    let swap_root = w::compute_merkle_root(swap_note, [0; 20], [0; 20]);
    let swap_output = w::note_commitment(1, 49850, owner, 113);

    println(f"swap_note={swap_note}");
    println(f"swap_root={swap_root}");
    println(f"swap_input_nullifier={swap_nullifier}");
    println(f"swap_output_commitment={swap_output}");

    let burn_out_0 = w::note_commitment(0, 0, owner, 111);
    let burn_out_1 = w::note_commitment(1, 0, owner, 222);
    println(f"burn_output_0={burn_out_0}");
    println(f"burn_output_1={burn_out_1}");

    println(f"collect_new_position={collected_position}");

}
