pub mod protocol;

pub use protocol::{
    encode_frame, encode_waveform_frame, rebucket_points, EncodeOptions, FLAG_HAS_TIME,
    FLAG_FREQ_REVERSED, FLAG_SILENCE, HEADER_LEN, MAGIC, MAX_POINT_COUNT, MAX_TIME_COUNT,
    VERSION,
};
