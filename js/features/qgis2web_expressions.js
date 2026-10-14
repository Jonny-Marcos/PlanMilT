/**
 * @fileoverview Implementa funções de expressão usadas pelo exportador QGIS para avaliar valores, atributos e geometrias.
 * @exports Funções globais fnc_* consumidas pelo avaliador QGIS.
 * @requires Contrato do avaliador: values contém argumentos na ordem da expressão e context fornece o contexto da feição/camada.
 */
// Aggregates

// Color

// Conditionals
/**
 * Implementa a expressão QGIS `coalesce()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_coalesce(values, context) {
    for (i = 0; i < values.length; i++) {
        if (values[i] !== null) {
            return values[i];
        }
        
    }
    return 'ERROR';
};

// Conversions

// Custom

// Date and Time

// Fields and Values

// Fuzzy Matching

// General

// Geometry
/**
 * Implementa a expressão QGIS `azimuth()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_azimuth(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `project()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_project(values, context) {
    return false;
};

// Math
/**
 * Implementa a expressão QGIS `abs()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_abs(values, context) {
    return Math.abs(values[0]);
};

/**
 * Implementa a expressão QGIS `degrees()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_degrees(values, context) {
    return values[0] * (180/Math.PI);
};

/**
 * Implementa a expressão QGIS `radians()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_radians(values, context) {
    return values[0] * (Math.PI/180);
};

/**
 * Implementa a expressão QGIS `sqrt()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_sqrt(values, context) {
    return Math.sqrt(values[0]);
};

/**
 * Implementa a expressão QGIS `cos()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_cos(values, context) {
    return Math.cos(values[0]);
};

/**
 * Implementa a expressão QGIS `sin()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_sin(values, context) {
    return Math.sin(values[0]);
};

/**
 * Implementa a expressão QGIS `tan()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_tan(values, context) {
    return Math.tan(values[0]);
};

/**
 * Implementa a expressão QGIS `asin()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_asin(values, context) {
    return Math.asin(values[0]);
};

/**
 * Implementa a expressão QGIS `acos()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_acos(values, context) {
    return Math.acos(values[0]);
};

/**
 * Implementa a expressão QGIS `atan()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_atan(values, context) {
    return Math.atan(values[0]);
};

/**
 * Implementa a expressão QGIS `atan2()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_atan2(values, context) {
    return Math.atan2(values[0]);
};

/**
 * Implementa a expressão QGIS `exp()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_exp(values, context) {
    return Math.exp(values[0]);
};

/**
 * Implementa a expressão QGIS `ln()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_ln(values, context) {
    return Math.log(values[0]);
};

/**
 * Implementa a expressão QGIS `log10()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_log10(values, context) {
    return Math.log10(values[0]);
};

/**
 * Implementa a expressão QGIS `log()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_log(values, context) {
    return Math.log(values[0]) / Math.log(values[1]);
};

/**
 * Implementa a expressão QGIS `round()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_round(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `rand()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_rand(values, context) {
    return Math.floor(Math.random()*(values[1]-values[0]+1)+values[0]);
};

/**
 * Implementa a expressão QGIS `randf()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_randf(values, context) {
    return Math.random()*(values[1]-values[0]+1)+values[0];
};

/**
 * Implementa a expressão QGIS `max()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_max(values, context) {
    return Math.max.apply(this, values);
};

/**
 * Implementa a expressão QGIS `min()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_min(values, context) {
    return Math.min.apply(this, values);
};

/**
 * Implementa a expressão QGIS `clamp()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_clamp(values, context) {
    return false;
};

// Operators

// Record

// String

// TimeManager

// Variables



/**
 * Implementa a expressão QGIS `scale_linear()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_scale_linear(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `scale_exp()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_scale_exp(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `floor()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_floor(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `ceil()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_ceil(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `pi()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_pi(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `to_int()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_to_int(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `to_real()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_to_real(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `to_string()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_to_string(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `to_datetime()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_to_datetime(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `to_date()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_to_date(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `to_time()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_to_time(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `to_interval()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_to_interval(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `if()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_if(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `aggregate()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_aggregate(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `relation_aggregate()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_relation_aggregate(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `count()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_count(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `count_distinct()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_count_distinct(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `count_missing()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_count_missing(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `minimum()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_minimum(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `maximum()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_maximum(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `sum()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_sum(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `mean()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_mean(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `median()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_median(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `stdev()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_stdev(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `range()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_range(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `minority()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_minority(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `majority()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_majority(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `q1()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_q1(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `q3()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_q3(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `iqr()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_iqr(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `min_length()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_min_length(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `max_length()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_max_length(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `concatenate()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_concatenate(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `regexp_match()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_regexp_match(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `now()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_now(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `age()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_age(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `year()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_year(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `month()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_month(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `week()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_week(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `day()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_day(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `hour()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_hour(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `minute()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_minute(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `second()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_second(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `day_of_week()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_day_of_week(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `lower()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_lower(values, context) {
    return values[0].toLowerCase();
};

/**
 * Implementa a expressão QGIS `upper()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_upper(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `title()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_title(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `trim()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_trim(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `levenshtein()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_levenshtein(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `longest_common_substring()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_longest_common_substring(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `hamming_distance()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_hamming_distance(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `soundex()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_soundex(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `char()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_char(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `wordwrap()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_wordwrap(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `length()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_length(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `replace()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_replace(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `regexp_replace()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_regexp_replace(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `regexp_substr()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_regexp_substr(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `substr()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_substr(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `concat()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_concat(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `strpos()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_strpos(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `left()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_left(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `right()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_right(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `rpad()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_rpad(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `lpad()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_lpad(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `format()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_format(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `format_number()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_format_number(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `format_date()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_format_date(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `color_rgb()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_color_rgb(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `color_rgba()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_color_rgba(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `ramp_color()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_ramp_color(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `color_hsl()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_color_hsl(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `color_hsla()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_color_hsla(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `color_hsv()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_color_hsv(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `color_hsva()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_color_hsva(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `color_cmyk()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_color_cmyk(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `color_cmyka()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_color_cmyka(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `color_part()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_color_part(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `darker()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_darker(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `lighter()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_lighter(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `set_color_part()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_set_color_part(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `area()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_area(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `perimeter()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_perimeter(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `x()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_x(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `y()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_y(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `z()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_z(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `m()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_m(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `point_n()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_point_n(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `start_point()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_start_point(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `end_point()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_end_point(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `nodes_to_points()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_nodes_to_points(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `segments_to_lines()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_segments_to_lines(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `make_point()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_make_point(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `make_point_m()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_make_point_m(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `make_line()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_make_line(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `make_polygon()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_make_polygon(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `x_min()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_x_min(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `x_max()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_x_max(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `y_min()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_y_min(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `y_max()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_y_max(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `geom_from_wkt()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_geom_from_wkt(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `geom_from_gml()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_geom_from_gml(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `relate()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_relate(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `intersects_bbox()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_intersects_bbox(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `disjoint()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_disjoint(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `intersects()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_intersects(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `touches()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_touches(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `crosses()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_crosses(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `contains()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_contains(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `overlaps()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_overlaps(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `within()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_within(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `translate()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_translate(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `buffer()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_buffer(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `centroid()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_centroid(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `point_on_surface()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_point_on_surface(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `reverse()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_reverse(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `exterior_ring()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_exterior_ring(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `interior_ring_n()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_interior_ring_n(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `geometry_n()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_geometry_n(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `boundary()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_boundary(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `line_merge()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_line_merge(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `bounds()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_bounds(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `num_points()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_num_points(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `num_interior_rings()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_num_interior_rings(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `num_rings()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_num_rings(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `num_geometries()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_num_geometries(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `bounds_width()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_bounds_width(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `bounds_height()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_bounds_height(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `is_closed()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_is_closed(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `convex_hull()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_convex_hull(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `difference()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_difference(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `distance()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_distance(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `intersection()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_intersection(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `sym_difference()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_sym_difference(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `combine()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_combine(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `union()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_union(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `geom_to_wkt()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_geom_to_wkt(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `geometry()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_geometry(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `transform()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_transform(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `extrude()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_extrude(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `order_parts()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_order_parts(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `closest_point()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_closest_point(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `shortest_line()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_shortest_line(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `line_interpolate_point()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_line_interpolate_point(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `line_interpolate_angle()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_line_interpolate_angle(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `line_locate_point()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_line_locate_point(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `angle_at_vertex()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_angle_at_vertex(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `distance_to_vertex()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_distance_to_vertex(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `uuid()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_uuid(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `get_feature()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_get_feature(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `layer_property()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_layer_property(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `var()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_var(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `eval()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_eval(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `attribute()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_attribute(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `_specialcol_()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc__specialcol_(values, context) {
    return false;
};

/**
 * Implementa a expressão QGIS `project_color()` no avaliador gerado.
 * @param {Array<*>} values - Argumentos da expressão, na ordem em que foram avaliados.
 * @param {Object} context - Contexto do avaliador, incluindo feição e camada atuais.
 * @returns {*} Valor calculado pela expressão QGIS.
 */
function fnc_project_color(values, context) {
    return false;
};
