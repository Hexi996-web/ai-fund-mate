from scripts.update_attention_pool import THEMES
from scripts.update_three_layer_evidence import STRUCTURE_CONTRACTS, number


def test_every_mother_pool_theme_has_a_structure_contract():
    theme_ids = {theme_id for theme_id, _query, _board in THEMES}
    assert len(theme_ids) == 36
    assert set(STRUCTURE_CONTRACTS) == theme_ids
    assert all(len(contract[1]) >= 3 for contract in STRUCTURE_CONTRACTS.values())


def test_invalid_market_values_do_not_break_a_theme_snapshot():
    assert number("-") == 0
    assert number(None) == 0
    assert number("123.4") == 123.4
